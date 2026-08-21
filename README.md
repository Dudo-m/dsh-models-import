# dsh-models-import

[English](README.en.md) | 中文

DeepSeek Harness（DSH）插件：在设置里新增「**模型Pro**」菜单，提供**模型导入与能力编辑**，原「模型」菜单保持原样、不受影响。

- 「获取可用模型」会识别 OpenAI 兼容网关在 `/v1/models` 里返回的 `capabilities` 扩展字段（视觉、推理/思考、工具、搜索、思考格式等），导入时一并写入模型配置；
- 模型行的展开区除了上下文窗口 / 最大输出，还可以编辑**可思考（含思考档位）**与**支持识图**等能力。

## 它解决什么问题

DSH 自带的模型发现只读取 OpenAI 标准字段（`id`、`context_window`、`max_output_tokens`），网关返回的 `capabilities` 能力对象会被丢弃；同时自带的模型行编辑器只能改容量字段。本插件：

1. **宿主端**在 Web 服务器上注册 `POST /plugins/models-import/models`，替你请求 `<baseURL>/models`（凭证自动从该提供商的配置解析），解析 `capabilities` 并映射为 `llm-pi-ai` 的模型字段；
2. **浏览器端**新增一个「模型Pro」设置分区（基于官方模型页的扩展副本）：同样的提供商卡片与编辑器，外加能力感知获取和逐模型能力编辑；原「模型」菜单继续用官方实现，两个页面编辑同一份 `settings.yaml`，随时可切回。

### 能力映射

| 网关 capabilities              | llm-pi-ai 模型字段                          |
|--------------------------------|---------------------------------------------|
| `vision: true`                 | `input: ['text', 'image']`                  |
| `reasoning: true` / `thinking: true` | `reasoningEfforts`（默认 `off`+`high`，`off` 仅在 `thinkingCanDisable` 为真时提供） |
| `thinkingFormat`（openai / deepseek / openrouter / together / zai / qwen / string-thinking / ant-ling） | `compat.thinkingFormat`（不在此列表内的格式不写入，交由 pi-ai 自行推断） |
| `contextWindow` / `context_length` | `contextWindow`                        |
| `maxOutput` / `max_completion_tokens` | `maxTokens`                        |

`tools` / `search` / `pdf` / `audioInput` 等暂无对应的 llm-pi-ai 配置项，仅在获取弹窗中作为徽标展示。

## 安装

插件通过 `dsh`（DeepSeek Harness）CLI 安装，先保证 `dsh` 可用，两种方式任选：

- **临时调用**（无需安装）：所有命令用 `npx @deepseek-ai/dsh ...` 直接调，官方启动命令：

  ```sh
  npx @deepseek-ai/dsh web
  ```

- **全局安装**（推荐）：把 `dsh` 安装到 PATH，之后直接用 `dsh` 命令：

  ```sh
  npm install -g @deepseek-ai/dsh
  ```

  启动：

  ```sh
  dsh web
  ```

  > 全局安装后，下文所有 `npx -y @deepseek-ai/dsh ...` 都可以简写为 `dsh ...`。

- **卸载 dsh**（仅全局安装过才需要）：

  ```sh
  npm uninstall -g @deepseek-ai/dsh
  ```

### 方式一：npm 安装（推荐，一条命令，无需任何授权）

发布到 npm 的是预构建产物，安装时不运行任何构建脚本：

```sh
npx -y @deepseek-ai/dsh plugin --profile web add dsh-models-import
```

全局安装 dsh 后同样一条命令：

```sh
dsh plugin --profile web add dsh-models-import
```

重启 `dsh web` 即生效。升级同样一条命令：`... add dsh-models-import@latest`。

> **国内镜像用户注意**：如果 pnpm 默认源是 npmmirror.com，新发布的包要过一阵才同步；安装报 `404` 或 `No matching version` 时显式指定官方源即可：
>
> ```sh
> npx -y @deepseek-ai/dsh plugin --profile web add dsh-models-import --registry=https://registry.npmjs.org
> ```

### 方式三：本地 clone 安装（开发）

```sh
git clone https://github.com/Dudo-m/dsh-models-import
cd dsh-models-import
pnpm install && pnpm run build

npx -y @deepseek-ai/dsh plugin --profile web add .
```

`dsh plugin` 会把它以 `link:` 依赖写进 web profile（`~/.dsh/profiles/web`），并追加到 `dsh.profile.bundles`；以后在 clone 目录里 `git pull && pnpm run build` 即可更新。

### 启动 / 验证

```sh
npx -y @deepseek-ai/dsh web
```

打开 http://127.0.0.1:3080 → 设置：出现「模型」和「模型Pro」两个菜单即插件已加载（若之前服务在跑，需重启一次让新插件加载）。

## 卸载

**卸载插件**：

```sh
npx -y @deepseek-ai/dsh plugin --profile web remove dsh-models-import
```

（全局安装后可用：`dsh plugin --profile web remove dsh-models-import`）

「模型Pro」菜单随插件一并消失，官方「模型」菜单全程未受影响。已经写进 `settings.yaml` 的模型与能力字段都是标准 llm-pi-ai 配置，卸载后依然有效（官方编辑器里能力字段需手改 YAML）。

**卸载 dsh 本体**（可选，仅全局安装过才需要）：

```sh
npm uninstall -g @deepseek-ai/dsh
```

## 使用

1. 设置 → **模型Pro** → 编辑某个自定义提供商（或新建时）；
2. 点击「获取可用模型」——请求先走本插件的能力感知路由；失败时自动回退到 DSH 原生发现，并提示“仅导入了 ID 与容量”；
3. 在弹窗中勾选要导入的模型，徽标显示接口报告的能力（可思考 / 识图 / 工具 / 搜索）；
4. 展开任意模型行，可继续编辑：可思考开关、思考档位（off…max）、支持识图、显示名称、上下文窗口、最大输出；
5. 保存即写入 `settings.yaml` 的 `llm-pi-ai.providers.<route>.models`，下一次请求立即生效（无需重启）。

## 发布（维护者）

发布到 npm 后用户就走「方式一」的零授权安装。自动流程：

1. 在 GitHub 仓库 Settings → Secrets → Actions 添加 `NPM_TOKEN`（npmjs.com → Access Tokens → Automation）；
2. 发布新版本：

```sh
npm version patch      # 或 minor / major
git push --follow-tags
```

tag 会触发 [.github/workflows/publish.yml](.github/workflows/publish.yml)：自动构建、发布到 npm、并把 tarball 挂到 GitHub Release。

也可以本地手动发一次（`prepare` 会自动构建）：

```sh
npm login
npm publish
```

> 若 npm 上 `dsh-models-import` 名称已被占用，把 `package.json` 的 `name` 改为 `@dudo-m/dsh-models-import`（scope 用你的 npm 用户名），发布与安装命令同步改名即可。

## 开发

```sh
pnpm install
pnpm run build      # 产出 lib/index.js（宿主半）与 lib/client.js（浏览器半）
pnpm run watch      # 增量构建
pnpm run typecheck
```

仓库结构：

```
src/index.ts                      # 宿主半：/plugins/models-import HTTP 路由
src/mapping.ts                    # capabilities → llm-pi-ai 字段映射（纯函数）
src/client/index.ts               # 浏览器半入口（re-export 设置页）
src/client/settings-models/       # 内置「模型」设置页的 vendored 扩展副本
src/client/helpers.ts             # 能力字段读写辅助
```

升级 DSH 后若官方「模型」页有更新，需要同步 vendored 副本（`src/client/settings-models/` 来自 `@deepseek-ai/dsh-client-ui-settings-models` 的 `src/client`），冲突点集中在 `ModelListEditor.tsx` 与 `locales.ts`。

## 许可

MIT。开源声明见 [LICENSE](LICENSE)。

`src/client/settings-models/` 是对 DeepSeek 官方 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 中 `@deepseek-ai/dsh-client-ui-settings-models`（MIT）浏览器半部分的 vendored 修改副本，文件头部与 LICENSE 中的第三方声明保留了上游归属。
