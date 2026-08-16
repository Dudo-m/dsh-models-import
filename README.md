# dsh-models-import

English | [中文](README.zh.md)

A DeepSeek Harness (DSH) plugin that upgrades the **Models** settings page for custom providers:

- "Fetch available models" now recognizes the `capabilities` extensions OpenAI-compatible gateways return in `/v1/models` (vision, reasoning/thinking, tools, search, thinking dialect, …) and adopts them into the imported model entries;
- a model row's disclosure edits more than capacities — **can-think (with thinking levels)** and **accepts images** are editable beside context window and max output.

## The problem it solves

Stock dsh model discovery reads only the plain OpenAI fields (`id`, `context_window`, `max_output_tokens`) and drops the gateway `capabilities` object; the stock row editor edits capacities only. This plugin:

1. **Host half** registers `POST /plugins/models-import/models` on the web server, fetches `<baseURL>/models` for you (resolving the provider's stored credential), parses `capabilities`, and maps them to `llm-pi-ai` model fields;
2. **Browser half** replaces the stock Models settings page with a vendored, extended copy (same place, same features, plus the extensions); the stock page is disabled through the composition layer, so nothing renders twice.

### Capability mapping

| gateway capabilities           | llm-pi-ai model field                      |
|--------------------------------|---------------------------------------------|
| `vision: true`                 | `input: ['text', 'image']`                  |
| `reasoning: true` / `thinking: true` | `reasoningEfforts` (default `off`+`high`; `off` offered only when `thinkingCanDisable` is true) |
| `thinkingFormat` (openai / deepseek / openrouter / together / zai / qwen / string-thinking / ant-ling) | `compat.thinkingFormat` (other formats are left unset for pi-ai's own inference) |
| `contextWindow` / `context_length` | `contextWindow`                        |
| `maxOutput` / `max_completion_tokens` | `maxTokens`                        |

`tools` / `search` / `pdf` / `audioInput` … have no llm-pi-ai configuration target yet and ride along as badges in the fetch dialog only.

## Install

The `dsh` CLI does not need to be installed globally — every command below goes through npx.

### Option 1: npm install (recommended — one command, no approvals)

The npm package ships prebuilt, so installing runs no build scripts at all:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add dsh-models-import
```

Restart `dsh web` to activate. Upgrades are the same one command: `... add dsh-models-import@latest`.

> **Mirror-registry users** (e.g. npmmirror.com): a freshly published package takes a while to sync; if the install reports `404` or `No matching version`, pin the official registry for the install:
>
> ```sh
> npx -y @deepseek-ai/dsh plugin --profile web add dsh-models-import --registry=https://registry.npmjs.org
> ```

### Option 2: install from GitHub (sources; needs build approval)

Prerequisites: pnpm (`npm i -g pnpm` if missing).

**Step 1** — run the install command (no global `dsh` needed; npx fetches it):

```sh
npx -y @deepseek-ai/dsh plugin --profile web add github:Dudo-m/dsh-models-import
```

**Step 2** — the first run fails while pnpm waits for build approval (a git install pulls sources and must run the `prepare` build script). That is expected. Copy the **exact key from your own error message** (it looks like `dsh-models-import@https://codeload.github.com/Dudo-m/dsh-models-import/tar.gz/<commit-sha>` — the key embeds the commit, so copy it verbatim) into the web profile's `pnpm-workspace.yaml`:

- Windows: `C:\Users\<you>\.dsh\profiles\web\pnpm-workspace.yaml`
- macOS / Linux: `~/.dsh/profiles/web/pnpm-workspace.yaml`

```yaml
allowBuilds:
  'dsh-models-import@https://codeload.github.com/Dudo-m/dsh-models-import/tar.gz/<commit-sha>': true
```

**Step 3** — re-run the same command from step 1. A `+ dsh-models-import github:Dudo-m/dsh-models-import` line means it installed (`prepare` builds automatically during install).

> If the retry fails with `ERR_PNPM_ENOENT ... dsh-models-import_tmp_...` (leftover state from the first, blocked attempt), remove and re-add once:
>
> ```sh
> npx -y @deepseek-ai/dsh plugin --profile web remove dsh-models-import
> npx -y @deepseek-ai/dsh plugin --profile web add github:Dudo-m/dsh-models-import
> ```

> Take the approval seriously: it allows the package's code to run a build on your machine at install time. Only approve repositories you trust, and pin a commit (`github:Dudo-m/dsh-models-import#<sha>`).

### Option 3: local clone (development)

```sh
git clone https://github.com/Dudo-m/dsh-models-import
cd dsh-models-import
pnpm install && pnpm run build

npx -y @deepseek-ai/dsh plugin --profile web add .
```

`dsh plugin` records it as a `link:` dependency in the web profile (`~/.dsh/profiles/web`) and appends it to `dsh.profile.bundles`; update later with `git pull && pnpm run build` inside the clone.

### Option 4: tarball (no build approval needed)

Each release carries a prebuilt tarball on GitHub; install straight from the download URL:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add https://github.com/Dudo-m/dsh-models-import/releases/download/v0.1.0/dsh-models-import-0.1.0.tgz
```

You can also `pnpm pack` inside a clone and install from the local path.

### Start / verify

```sh
npx -y @deepseek-ai/dsh web
```

Open http://127.0.0.1:3080 → Settings → Models — if the page renders, the plugin took over (restart a running server once so the new plugin loads).

## Uninstall

```sh
npx -y @deepseek-ai/dsh plugin --profile web remove dsh-models-import
```

The dependency and composition layer go with it; restart `dsh web` and the stock Models page is back. Model entries and capability fields already written to `settings.yaml` are ordinary llm-pi-ai configuration — they keep working (the stock editor just shows them as unknown fields).

To temporarily return to the stock page while keeping the plugin installed, delete this row from the package's `cordis.patch.yml`:

```yaml
- id: ui-settings-models
  disabled: true
```

## Use

1. Settings → Models → edit a custom provider (or create one);
2. click "Fetch available models" — the request first takes this plugin's capability-aware route, falling back to stock discovery (with a note) when it cannot answer;
3. pick models in the dialog; badges show what the endpoint reported (thinking / vision / tools / search);
4. expand any row to edit: the thinking toggle, thinking levels (off…max), image input, display name, context window, max output;
5. saving writes `llm-pi-ai.providers.<route>.models` in `settings.yaml`; the next request picks it up (no restart).

## Releasing (maintainer)

Publishing to npm is what gives users the zero-approval install. Automated flow:

1. add `NPM_TOKEN` under the GitHub repo's Settings → Secrets → Actions (from npmjs.com → Access Tokens → Automation);
2. cut a release:

```sh
npm version patch      # or minor / major
git push --follow-tags
```

The tag triggers [.github/workflows/publish.yml](.github/workflows/publish.yml): build, publish to npm, and attach the tarball to the GitHub release.

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
pnpm run watch
pnpm run typecheck
```

Layout:

```
src/index.ts                      # host half: the /plugins/models-import HTTP route
src/mapping.ts                    # capabilities → llm-pi-ai field mapping (pure)
src/client/index.ts               # browser half entry (re-exports the settings page)
src/client/settings-models/       # vendored, extended copy of the stock Models page
src/client/helpers.ts             # capability-field read/write helpers
```

After a DSH upgrade that changes the stock Models page, refresh the vendored copy (`src/client/settings-models/` mirrors `@deepseek-ai/dsh-client-ui-settings-models`'s `src/client`); the integration points are `ModelListEditor.tsx` and `locales.ts`.

## License

MIT — see [LICENSE](LICENSE).

`src/client/settings-models/` is a vendored, modified copy of the browser half of `@deepseek-ai/dsh-client-ui-settings-models` from DeepSeek's [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT); file headers and the third-party notice in LICENSE retain the upstream attribution.
