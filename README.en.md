# dsh-models-import

English | [中文](README.md)

A DeepSeek Harness (DSH) plugin that adds a "**Models Pro**" settings section with **capability-aware model import & editing** — the stock Models section stays untouched.

- "Fetch available models" recognizes `capabilities` extensions OpenAI-compatible gateways return in `/v1/models` (vision, reasoning/thinking, tools, search, thinking format, …) and adopts them into imported model entries;
- A model row's disclosure area edits more than capacities — **can-think (with thinking levels)** and **accepts images** are editable alongside context window and max output.

## What problem it solves

Stock DSH model discovery reads only plain OpenAI fields (`id`, `context_window`, `max_output_tokens`) and drops the gateway's `capabilities` object; the stock row editor only edits capacity fields. This plugin:

1. **Host half** registers `POST /plugins/models-import/models` on the web server, fetches `<baseURL>/models` for you (credentials resolved automatically from that provider's config), parses `capabilities` and maps them to `llm-pi-ai` model fields;
2. **Browser half** adds a "Models Pro" settings section (built on an extended copy of the stock page): the same provider cards and editors, plus capability-aware fetching and per-model capability editing. The stock Models section keeps running the official implementation — both pages edit the same `settings.yaml`, so you can switch back any time.

### Capability mapping

| gateway capabilities | llm-pi-ai model field |
|--------------------------------|---------------------------------------------|
| `vision: true` | `input: ['text', 'image']` |
| `reasoning: true` / `thinking: true` | `reasoningEfforts` (default `off`+`high`; `off` offered only when `thinkingCanDisable` is true) |
| `thinkingFormat` (openai / deepseek / openrouter / together / zai / qwen / string-thinking / ant-ling) | `compat.thinkingFormat` (formats not in this list are not written; pi-ai infers on its own) |
| `contextWindow` / `context_length` | `contextWindow` |
| `maxOutput` / `max_completion_tokens` | `maxTokens` |

`tools` / `search` / `pdf` / `audioInput` etc. have no corresponding llm-pi-ai config option yet — they are shown as badges in the fetch dialog only.

## Installation

The plugin is installed through the `dsh` (DeepSeek Harness) CLI. Make `dsh` available first — either way works:

- **Run on the fly** (no install needed): invoke everything with `npx @deepseek-ai/dsh ...`. The official start command is:

  ```sh
  npx @deepseek-ai/dsh web
  ```

- **Install globally** (recommended): puts `dsh` on your PATH, so you can just use `dsh`:

  ```sh
  npm install -g @deepseek-ai/dsh
  ```

  Start it with:

  ```sh
  dsh web
  ```

  > Once installed globally, every `npx -y @deepseek-ai/dsh ...` below can be shortened to `dsh ...`.

- **Uninstall dsh** (only needed if you installed it globally):

  ```sh
  npm uninstall -g @deepseek-ai/dsh
  ```

### Option 1: npm install (recommended — one command, no approvals)

The npm package ships prebuilt; installing runs no build scripts at all:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add dsh-models-import
```

The same one-liner with a globally installed dsh:

```sh
dsh plugin --profile web add dsh-models-import
```

Restart `dsh web` to activate. Upgrading is the same one-liner: `... add dsh-models-import@latest`.

> **Mirror-registry users** (e.g. npmmirror.com): a freshly published package takes a while to sync; if install reports `404` or `No matching version`, pin the official registry:
>
> ```sh
> npx -y @deepseek-ai/dsh plugin --profile web add dsh-models-import --registry=https://registry.npmjs.org
> ```

### Option 3: local clone (development)

```sh
git clone https://github.com/Dudo-m/dsh-models-import
cd dsh-models-import
pnpm install && pnpm run build

npx -y @deepseek-ai/dsh plugin --profile web add .
```

`dsh plugin` records it as a `link:` dependency in the web profile (`~/.dsh/profiles/web`) and appends it to `dsh.profile.bundles`; update later with `git pull && pnpm run build` inside the clone.

### Start / verify

```sh
npx -y @deepseek-ai/dsh web
```

Open http://127.0.0.1:3080 → Settings: seeing both **Models** and **Models Pro** means the plugin is loaded (restart a running server once so the new plugin loads).

## Uninstall

**Remove the plugin**:

```sh
npx -y @deepseek-ai/dsh plugin --profile web remove dsh-models-import
```

(With a global install you can use: `dsh plugin --profile web remove dsh-models-import`)

The Models Pro section disappears with it; the stock Models section is never touched. Model entries and capability fields already written to `settings.yaml` are ordinary llm-pi-ai configuration — they keep working (the stock editor just shows unknown fields).

**Uninstall dsh itself** (optional; only if you installed it globally):

```sh
npm uninstall -g @deepseek-ai/dsh
```

## Usage

1. Settings → **Models Pro** → edit a custom provider (or while creating one);
2. click "Fetch available models" — the request first takes the plugin's capability-aware route, falling back to stock discovery (with a "IDs and capacities only" note) if that fails;
3. in the dialog, check the models to import; badges show the capabilities the API reported (can-think / vision / tools / search);
4. expand any model row to keep editing: can-think toggle, thinking levels (off…max), accepts images, display name, context window, max output;
5. saving writes to `llm-pi-ai.providers.<route>.models` in `settings.yaml` — effective on the next request (no restart needed).

## Publishing (maintainers)

Once published to npm, users go through Option 1's zero-approval install. Automated flow:

1. Add `NPM_TOKEN` under the GitHub repo's Settings → Secrets → Actions (from npmjs.com → Access Tokens → Automation);
2. cut a release:

```sh
npm version patch      # or minor / major
git push --follow-tags
```

The tag triggers [.github/workflows/publish.yml](.github/workflows/publish.yml): build, publish to npm, and attach the tarball to a GitHub Release.

A one-off manual publish works too (`prepare` builds automatically):

```sh
npm login
npm publish
```

> If the npm name `dsh-models-import` is taken, rename the package to `@dudo-m/dsh-models-import` (scope = your npm username) and adjust the publish/install commands accordingly.

## Development

```sh
pnpm install
pnpm run build      # emits lib/index.js (host half) and lib/client.js (browser half)
pnpm run watch      # incremental builds
pnpm run typecheck
```

Layout:

```
src/index.ts                      # host half: /plugins/models-import HTTP route
src/mapping.ts                    # capabilities → llm-pi-ai field mapping (pure)
src/client/index.ts               # browser half entry (re-exports settings page)
src/client/settings-models/       # vendored, extended copy of the stock Models page
src/client/helpers.ts             # capability-field read/write helpers
```

After a DSH upgrade changes the stock Models page, refresh the vendored copy (`src/client/settings-models/` mirrors `@deepseek-ai/dsh-client-ui-settings-models`'s `src/client`); integration points are `ModelListEditor.tsx` and `locales.ts`.

## License

MIT — see [LICENSE](LICENSE).

`src/client/settings-models/` is a vendored, modified copy of the browser half of `@deepseek-ai/dsh-client-ui-settings-models` from DeepSeek's [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT); the upstream attribution is preserved in file headers and in the third-party notices in the LICENSE.
