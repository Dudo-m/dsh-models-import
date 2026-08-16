/**
 * Two artifacts out of one package:
 *
 * 1. `lib/index.js` — the Node half the host Loader imports (plain ESM).
 * 2. `lib/client.js` — the browser half in the dsh client-bundle shape: a
 *    classic script that registers a closure factory through
 *    `window.__ModuleLoader__.load({ id, factory })`, with the platform
 *    modules (react, cordis, the shared UI libraries) left external so the
 *    factory resolves them from the shell's module table through the
 *    injected `require`.
 *
 * The banner/footer/intro, the external set, and the inline CSS-modules
 * plugin mirror the harness's own client-bundle preset
 * (packages/client/tsdown.client.ts in the deepseek-harness repository): a
 * `x.module.css` import yields its hashed class map and injects one
 * `<style data-plugin="dsh-models-import">` tag at factory execution, which
 * the client loader removes when the plugin unloads.
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'

/** The shell's frozen module-table specifiers (browser bundle externals). */
const PLATFORM_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  // The snapshot-store engine (createSnapshotStore), shared by every settings
  // page store: the same documented exemption the harness preset carries —
  // the runtime is an immediately-tier module-table row, so requiring it from
  // a bundle is safe without inlining a second engine instance.
  '@deepseek-ai/dsh-client-runtime/client',
]

const PKG_ID = 'dsh-models-import'

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline.
 * The suffix matters: tsdown's guard matches ids ending in `.css`.
 */
const CSS_VIRTUAL_PREFIX = '\0dmi-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

export default defineConfig([
  {
    name: PKG_ID,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: true,
    outputOptions: { entryFileNames: 'index.js' },
  },
  {
    name: `${PKG_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    dts: false,
    sourcemap: false,
    // clean must stay off: it would wipe the node-half output emitted above.
    clean: false,
    external: [...PLATFORM_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [{
      name: 'dmi-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const abs = importer !== undefined
          ? resolvePath(dirname(importer), source)
          : resolvePath(source)
        return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
        // One <style data-plugin> per module file; idempotent under re-evaluation.
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(`${PKG_ID}/${basename(fileId)}`)};`,
          'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
          '  const tag = document.createElement(\'style\');',
          `  tag.dataset.plugin = ${JSON.stringify(PKG_ID)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PKG_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
