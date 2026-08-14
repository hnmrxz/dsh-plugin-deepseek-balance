# dsh-plugin-deepseek-balance

在 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 底部状态栏实时显示 DeepSeek 账户余额。

Real-time DeepSeek account balance in the DSH bottom status bar (the band under the composer, next to the shipped stats line).

## Features

- 实时余额：总余额 / 赠送 / 充值一目了然，悬停查看明细
- 每 30 秒自动刷新，点击立即刷新
- 复用 DSH 的 `DEEPSEEK_API_KEY` 凭据（与自带 `llm-deepseek` 适配器同一引用），**无需再填 Key**
- 尊重 `llm-deepseek` 设置里的 `baseURL`（自定义网关也能用）
- API Key 只停留在 Host 进程，浏览器端永远拿不到
- 中英文自动跟随 DSH 界面语言

## Screenshots

![底部状态栏余额显示](docs/balance.png)

## Install

> 需要 DSH 0.1.0-rc.x（Web profile）。

### 1. 安装到 profile

在 DSH 的 web profile 目录（通常 `~/.dsh/profiles/web`）里把本包加为依赖：

```bash
cd ~/.dsh/profiles/web
npm install dsh-plugin-deepseek-balance
# 或 pnpm add dsh-plugin-deepseek-balance
# 本地开发：npm install /path/to/dsh-plugin-deepseek-balance 或 pnpm add ../dsh-plugin-deepseek-balance
```

### 2. 加入 composition

编辑同一个 profile 下的 `cordis.patch.yml`（没有就新建），插入一行：

```yaml
- insert:
    - id: deepseek-balance
      name: dsh-plugin-deepseek-balance
```

### 3. 重启 dsh

```bash
dsh --profile web
```

打开 Web UI，composer 下方的状态带上就会出现 `DeepSeek ¥xxx · 可用`。

## Configuration

无需配置。Key 来源（按顺序）：

1. DSH 设置页 Models 里配置的 `DEEPSEEK_API_KEY`（推荐，通过 credentials 服务写入）
2. 启动环境里的 `DEEPSEEK_API_KEY` 环境变量

## How it works

```
┌─────────────┐        ┌──────────────────────┐
│  Browser     │        │  dsh Host process    │
│  client.js   │  GET   │  webServer route     │
│ (composer    │ ─────► │  /dsh-deepseek-      │
│  .dock slot) │ ◄───── │  balance             │
└─────────────┘  JSON   │      │               │
                        │      ├─ credentials  │
                        │      │  .resolve(    │
                        │      │  DEEPSEEK_    │
                        │      │  API_KEY)     │
                        │      ▼               │
                        │  fetch              │
                        │  {baseURL}/user/     │
                        │  balance             │
                        └──────────────────────┘
```

- **Host half** (`lib/index.js`)：注册同源 HTTP 路由 `/dsh-deepseek-balance`，通过 `credentials` seam 解析 API Key（按请求实时读取，改了 Key 无需重启），调用 DeepSeek `GET /user/balance`，10 秒内缓存结果。
- **Client half** (`lib/client.js`)：注册进 `conversation.composer.dock` 槽位，用 timer service 每 30 秒轮询路由，点击立即刷新。
- 两端通过同源路由通信（`dsh.client` 声明让 web 端自动加载 client bundle），不需要 Remote/typert 代码生成。

## Development

```bash
# 仓库结构
lib/index.js    # Host half（Cordis plugin，纯 Node ESM）
lib/client.js   # Client half（web bundle，__ModuleLoader__ 格式）
```

改动后重新安装到 profile（或 `npm link`）并重启 dsh 即可。

## Publish

推送到 GitHub 后，发布到 npm 供用户直接安装：

```bash
# 推送前先改包名（GitHub 同名仓库惯例）
# package.json 里把 "name" 改为 "@<你的GitHub用户名>/dsh-plugin-deepseek-balance"

git remote add origin git@github.com:<你的GitHub用户名>/dsh-plugin-deepseek-balance.git
git push -u origin main

npm login
npm publish
```

## License

[MIT](LICENSE)
