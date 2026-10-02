# wechat-md-studio

把 Markdown 渲染成**微信公众号可直接粘贴的全内联样式 HTML**，附带本地实时预览编辑器和草稿箱推送。

## 为什么需要它

微信公众号后台会过滤掉 `<style>`、`class`、`id`，并且丢弃 `var()` 和 `calc()` —— 只认元素上的行内 `style` 属性。
所以「Markdown → HTML → 粘到公众号」这条路走不通：粘过去只剩裸文本，排版全丢。

这个项目的做法是把主题 CSS **逐条内联到每个元素上**，产出一段微信原样接受的 `<section>` 嵌套结构。
编辑器预览、HTTP 接口、命令行三条入口共用同一条渲染管线，所以「所见即所得」。

## 功能

- **48 套主题** —— 6 套基础主题 + 4 个系列 × 8 种配色的程序化生成主题 + 10 套精选版式
- **内置编辑器** —— CodeMirror 6，行号、Markdown 语法高亮、菜单栏（文件/编辑/格式/插入/样式/帮助）、行列状态栏
- **82 个代码块配色** —— 从本地 `highlight.js` 读取，不依赖 CDN
- **草稿推送** —— Markdown 直接进公众号草稿箱，正文图片自动转存微信 CDN
- **可用作服务** —— 一个 HTTP 接口就能把 Markdown 转成微信 HTML，方便脚本或 agent 调用

## 快速开始

需要 **Node.js ≥ 22** 和 **pnpm**。

```bash
pnpm install
pnpm build          # 产出 dist/ 和 public/static/
pnpm start          # 默认 http://127.0.0.1:8787
```

打开 <http://127.0.0.1:8787> 就是编辑器，左边写 Markdown，右边实时预览微信公众号效果。

其他脚本：

```bash
pnpm check          # 回归自检：把 48 套主题全渲染一遍并校验产物合法性
pnpm themes         # 列出全部主题名
pnpm code-themes    # 列出全部代码块配色名
```

## 渲染管线

```
Markdown
  ├─ marked 渲染（GFM / 脚注 / 代码高亮）
  ├─ 合并主题 CSS（底座 + 版式 + 运行时覆盖）
  ├─ processCSS 展平 var() 与 calc()
  ├─ juice 内联到每个元素的 style 属性
  └─ 结构后处理（嵌套列表平铺、图片尺寸、清理编辑器残留属性）
      ↓
以 <section> 开头的全内联样式 HTML  →  微信后台 / 草稿箱
```

`pnpm check` 会对每个主题的产物断言：以 `<section` 开头、内联样式数量达标、**零** `var()` / `calc()` / `<style>` / `class` 残留。

## 三种用法

### 1. 编辑器

浏览器打开即用。选中文字用「格式」菜单或快捷键排版，「复制」到公众号后台粘贴，或「发布」直接建草稿。

### 2. 命令行

不需要起服务，适合脚本和 CI。`package.json` 里注册了 `wechat-md` 这个 bin，
`pnpm install` 后可以直接敲 `wechat-md`，也可以走全路径 `./dist/cli-convert.js`。

```bash
wechat-md article.md --theme bold-blue --font-size large > out.html
cat article.md | wechat-md --theme focus-green        # stdin -> stdout
wechat-md article.md --json                           # 结构化输出

wechat-md article.md --draft --title "我的文章"        # 直接推进公众号草稿箱
wechat-md --list-themes                               # 48 套主题
wechat-md --list-code-themes                          # 82 套代码配色
wechat-md --check-all                                 # 回归自检
wechat-md --help                                      # 完整用法
```

参数：`--theme` `--font-size` `--background-type` `--code-theme` `--json`，
草稿推送再加 `--draft --title --author --digest --cover --source-url --app-id --app-secret`。

**输出约定**：stdout 只放机器可读结果（HTML / JSON / mediaId），摘要和报错走 stderr，
所以 `> out.html` 和 `MEDIA=$(wechat-md … --draft …)` 都是干净的。
退出码 `0` 成功 / `1` 运行失败 / `2` 参数有误。

主题名、配色名、字号写错会**直接报错并给出候选**，不会静默回退到默认值。

### 3. HTTP 接口

完整接口文档见 **[docs/API.md](docs/API.md)**。最核心的两个：

```bash
# Markdown -> 微信可用 HTML
curl -X POST http://127.0.0.1:8787/api/convert \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# 标题\n\n正文","theme":"bold-blue"}'

# Markdown -> 公众号草稿箱（服务端全程完成，不需要浏览器）
curl -X POST http://127.0.0.1:8787/api/wechat/draft \
  -H 'Content-Type: application/json' \
  -d '{"appId":"wx...","appSecret":"...","title":"我的文章","markdown":"# 我的文章\n\n正文"}'
```

所有接口统一返回 `{code, msg, data}`，**判成败看 `code` 而不是 HTTP 状态码**。

## 配置

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址。对外提供服务时改成 `0.0.0.0` |
| `MD2WECHAT_API_KEY` | 空 | 设置后 `/api/convert` 与 `/api/wechat/draft` 需要携带密钥；不设置则本机免鉴权 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 空 | 公众号凭证默认值，请求体传了则以请求体为准 |

推送草稿的前置条件：**运行服务的机器出网 IP 必须在公众号后台的 IP 白名单里**，否则微信会返回 `errcode 40164`（服务会把它翻译成可读提示）。可以用 `GET /api/wechat/ip` 查本机出网 IP。

## 目录结构

```
.
├── build.mjs                 # esbuild 构建脚本（服务端 / 命令行 / 浏览器编辑器 三个产物）
├── docs/API.md               # 接口文档
├── public/
│   ├── index.html            # 编辑器页面
│   └── static/editor.js      # 编辑器 bundle（构建产物，已在 .gitignore）
├── src/
│   ├── server.ts             # Hono 服务：页面 + Convert API + 草稿推送
│   ├── renderer.ts           # 渲染内核：Markdown -> 微信内联 HTML
│   ├── inline.ts             # juice 内联管线 + 结构后处理
│   ├── juice-prep.ts         # 内联前的 CSS/HTML 清洗
│   ├── code-theme.ts         # 从本地 highlight.js 读取代码配色
│   ├── wechat.ts             # 公众号 API 封装（token / 图片 / 草稿）
│   ├── cli-convert.ts        # 命令行工具 + 主题回归自检
│   ├── themes/               # 主题定义（配色 + 版式注册表 + 生成器）
│   └── editor/main.js        # CodeMirror 6 编辑器封装
└── vendor/                   # 渲染器源码（见下方「来源与许可」）
    ├── core/                 # @md/core —— Markdown 渲染与扩展
    └── shared/               # @md/shared —— 主题 CSS 等共享配置
```

`vendor/` 是**源码级拷贝**而非 npm 依赖，构建时由 `build.mjs` 里的两个 esbuild 插件接管：
一个把 Vite 专有的 `?raw` 导入降级成字符串导出，另一个把 `@md/shared/xxx` 这类裸包名重映射到 `vendor/` 目录。

## 已知限制

- **`/api/convert` 的产物终点是浏览器剪贴板。** 它是富文本片段，不是独立网页 —— 单独用浏览器打开只能看到裸内容，这是预期行为。没有剪贴板的调用方（比如 agent）应该用 `/api/wechat/draft`。
- 请求体上限 256 KB。
- 草稿推送需要真实公众号凭证与 IP 白名单，本项目不含任何内置凭证。
- 主题是自研实现，与原版 md2wechat 的视觉并非逐像素一致。

## 来源与许可

本项目代码以 **MIT** 许可发布，见 [LICENSE](LICENSE)。

`vendor/` 目录下的渲染器源码来自 [doocs/md](https://github.com/doocs/md) 的 `packages/core` 与 `packages/shared`，
原项目以 **WTFPL** 许可发布（等同公共领域，允许任意使用、修改与再分发）。本仓库保留了原始文件内容，仅做路径调整以便独立构建。

编辑器交互参考了 [doocs/md](https://github.com/doocs/md) 的组织方式。
