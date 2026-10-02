# 接口文档

本服务把 Markdown 渲染成**微信公众号可用的全内联样式 HTML**，并提供草稿推送。
编辑器、HTTP 接口、命令行工具走的是**同一条渲染管线**，结果一致。

## 0. 启动

```bash
cd md2wechat/studio
node build.mjs          # 构建（改过源码后需要）
node dist/server.js     # 启动，默认 http://127.0.0.1:8787
```

带上公众号凭证启动（这样编辑器里就不用再输 AppSecret，接口也不必每次传）：

```bash
WECHAT_APP_ID=wx... WECHAT_APP_SECRET=... node dist/server.js
```

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址。对外提供服务时改 `0.0.0.0` |
| `MD2WECHAT_API_KEY` | 空 | 设置后 `/api/convert` 与 `/api/wechat/draft` 需要密钥；不设置则本机免鉴权 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 空 | 公众号凭证默认值，请求体里传了就以请求体为准 |

> 凭证只存在于进程内存，本服务**不会**把它写进任何文件。

## 1. 鉴权

以下三个请求头**完全等价**，任选其一（仅当设置了 `MD2WECHAT_API_KEY` 时校验）：

```
Md2wechat-API-Key: <key>
X-API-Key: <key>
Authorization: Bearer <key>
```

校验失败返回 HTTP 401，body 为 `{"code":401,"msg":"invalid api key","data":null}`。

> 只读接口（`/api/themes`、`/api/code-themes`、`/api/wechat/ip`）不需要鉴权。

## 2. 全部响应信封

所有接口都返回同一个外层结构，**判断成功要看 `code`，不是 HTTP 状态码**：

```json
{ "code": 0, "msg": "success", "data": { } }
```

## 3. `GET /api/themes`

返回 48 套主题。

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "themes": [
      {
        "name": "default",
        "label": "微信经典",
        "series": "basic",
        "description": "微信经典风格，温暖舒适",
        "primaryColor": "#d4703a",
        "background": "#fffdfa"
      }
    ]
  }
}
```

`series` 取值：`basic`(6) / `minimal`(8) / `focus`(8) / `elegant`(8) / `bold`(8) / `featured`(10)。
`name` 才是要传给 `theme` 参数的值，`label` 只是给人看的。

## 4. `GET /api/code-themes`

代码块配色，来自本地 highlight.js（不依赖 CDN）。

```json
{ "code": 0, "msg": "success", "data": { "themes": ["github", "..."], "default": "github" } }
```

## 5. `POST /api/convert` ★ 核心

把 Markdown 转成微信可用 HTML。

**请求体**（`Content-Type: application/json`，上限 256 KB）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `markdown` | ✅ | Markdown 原文。为空返回 400 |
| `theme` | | 主题 `name`，未知值回退 `default` |
| `fontSize` | | `small`(15px) / `medium`(16px，默认) / `large`(17px) |
| `backgroundType` | | `default`(主题自带) / `grid`(同色系淡网格) / `none`(透明) |
| `codeTheme` | | highlight.js 样式名；不填则用主题自带的 |

**响应 `data`**：

| 字段 | 说明 |
| --- | --- |
| `html` | **全内联样式**的 HTML，以 `<section` 开头。零 `class` / `<style>` / `var()` / `calc()` |
| `theme` / `fontSize` / `backgroundType` | 实际生效的值（含回退结果） |
| `wordCount` | 非空白字符数 |
| `estimatedReadTime` | 预计阅读分钟数，`max(1, ceil(wordCount/300))` |
| `headings` | `[{level, text}]`，只含 1–3 级 |

```bash
curl -s --noproxy '*' -X POST http://127.0.0.1:8787/api/convert \
  -H 'Content-Type: application/json' \
  -d '{"markdown":"# 标题\n\n正文 **加粗**\n","theme":"bold-blue","fontSize":"large","backgroundType":"grid"}'
```

Python（标准库，无需依赖）：

```python
import json, urllib.request

req = urllib.request.Request(
    "http://127.0.0.1:8787/api/convert",
    data=json.dumps({
        "markdown": open("article.md", encoding="utf-8").read(),
        "theme": "bold-blue",
        "fontSize": "medium",
    }).encode(),
    headers={"Content-Type": "application/json"},
)
# 本机有代理劫持时，用空 ProxyHandler 直连
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
resp = json.loads(opener.open(req, timeout=30).read())
assert resp["code"] == 0, resp["msg"]

# 写成一个可直接打开预览的 HTML
open("out.html", "w", encoding="utf-8").write(
    "<!doctype html><meta charset='utf-8'><body style='margin:0'>" + resp["data"]["html"]
)
```

### ⚠️ `html` 是给**浏览器剪贴板**用的

`/api/convert` 的输出是富文本片段，正确的用法是写进剪贴板（`text/html`）再粘到公众号后台。
**它不是独立网页**——单独用浏览器打开只能看到纯内容、没有文章容器样式，这是正常的。

如果调用方没有浏览器/剪贴板（比如 agent），请直接走第 8 节的草稿接口。

## 6. `GET /api/wechat/ip`

查询本机出网公网 IP，用于填公众号后台的 IP 白名单。

```json
{ "code": 0, "msg": "success",
  "data": { "ip": "1.2.3.4", "hint": "把这个 IP 加到「公众号后台 -> 设置与开发 -> 基本配置 -> IP 白名单」后才能推送草稿。" } }
```

> **这个接口用的是国内回显服务（`myip.ipip.net`），不是 `api.ipify.org`。**
> 原因：微信 API 属于国内域名，在有代理/VPN 的机器上走**直连**，而国外回显服务会走**代理节点**，
> 两者报出来的 IP 可能差一个洲，照着填白名单必然失败。
> 仍以微信 `40164` 报错里回显的 IP 为最终准绳。

## 7. `POST /api/wechat/verify`

校验 AppID / AppSecret 能否取到 `access_token`。**建议推送前先调这个**。

```bash
curl -s --noproxy '*' -X POST http://127.0.0.1:8787/api/wechat/verify \
  -H 'Content-Type: application/json' \
  -d '{"appId":"wx...","appSecret":"..."}'
```

- 成功：`{"code":0,"msg":"凭证有效","data":{"ok":true}}`
- 失败：`{"code":1,"msg":"微信公众号接口 stable_token 失败: [40013] invalid appid ...","data":{"ok":false}}`（HTTP 400）

## 8. `POST /api/wechat/draft` ★ 一步到草稿箱

从 Markdown 直接创建公众号草稿，**全程服务端，不碰浏览器**。

**请求体**：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | ✅ | 标题。公众号后台编辑器限 32 字；**接口本身不拦**（实测送 40 字进 `draft/add` 未被截断）。建议按 32 字设计以免后台改标题 |
| `markdown` | ✅ | 正文 Markdown，服务端自己渲染 |
| `appId` / `appSecret` |  | 不传则取环境变量 |
| `author` / `digest` / `contentSourceUrl` | | 作者(≤16字) / 摘要(≤120字，留空由微信截取) / 原文链接 |
| `coverImageUrl` | ⚠️ | 封面图 URL；留空则取正文第一张图。**两者都没有会直接返回 400**——微信要求封面必填，不拦就会收到 `40007 invalid media_id` |
| `needOpenComment` / `onlyFansCanComment` | | 布尔，是否开启评论 / 仅粉丝可评 |
| `theme` / `fontSize` / `backgroundType` / `codeTheme` | | 与 `/api/convert` 完全一致。**漏传任何一个都会导致草稿与预览不一致** |

**响应 `data`**：

| 字段 | 说明 |
| --- | --- |
| `mediaId` | 草稿的 media_id |
| `uploadedImages` | 成功转存到微信 CDN 的正文图片数 |
| `failedImages` | 上传失败的图片 URL 列表（**不阻断草稿创建**） |
| `hasThumb` | 是否成功设置封面 |
| `wordCount` / `theme` | 渲染结果 |

```bash
curl -s --noproxy '*' -X POST http://127.0.0.1:8787/api/wechat/draft \
  -H 'Content-Type: application/json' \
  -d '{"appId":"wx...","appSecret":"...","title":"我的文章","markdown":"# 我的文章\n\n正文","theme":"default"}'
```

内部链路：`stable_token` → `media/uploadimg`（正文图换 mmbiz URL）→ `material/add_material?type=image`（封面拿 `thumb_media_id`）→ `draft/add`。

**先决条件**：服务端出网 IP 必须在公众号后台白名单里，否则报 `errcode 40164`（服务会自动翻译成人话返回）。

**已实测确认的两件事**：
- 封面用 `type=image` 拿到的 `media_id` **可以直接当 `thumb_media_id` 使用**，不必改用 `type=thumb`（后者限 64KB 且仅 JPG，反而更容易失败）。
- `thumb_media_id` **必填**。传空串会返 `40007 invalid media_id`，所以服务在调用前就拦下来给中文提示。

## 9. 命令行（不起服务也能用）★ 无状态 agent 首选

适合脚本、CI、以及**没有常驻服务的 agent**。`package.json` 已注册 `wechat-md` 这个 bin，
也可直接用全路径 `./dist/cli-convert.js`（带 shebang 且可执行）。

```bash
# 文件 -> HTML
wechat-md article.md --theme bold-blue --font-size large > out.html

# stdin -> stdout
cat article.md | wechat-md --theme focus-green

# 结构化输出（含 wordCount / headings）
wechat-md article.md --json

# 直接推进公众号草稿箱 —— 不需要服务常驻！
wechat-md article.md --draft --title "我的文章" --cover https://example.com/cover.png

# 枚举与自检
wechat-md --list-themes          # 48 套主题
wechat-md --list-code-themes     # 82 套代码配色
wechat-md --check-all [文件.md]  # 把每套主题渲染一遍并校验产物合法性
wechat-md --help                 # 完整用法
wechat-md --version
```

### 参数

| 参数 | 说明 |
| --- | --- |
| `--theme <name>` | 主题名，默认 `default` |
| `--font-size <档位>` | `small` / `medium` / `large`，默认 `medium` |
| `--background-type <类型>` | `default` / `grid` / `none`，默认 `default` |
| `--code-theme <name>` | 代码块配色，默认用主题自带的 |
| `--json` | 输出结构化 JSON 而不是 HTML |
| `--draft` | 渲染并直接调用微信接口建草稿 |
| `--title` / `--author` / `--digest` / `--source-url` | 草稿元信息（`--title` 在 `--draft` 时必填） |
| `--cover <图片URL>` | 封面图；留空则取正文第一张图，两者都没有会报错 |
| `--app-id` / `--app-secret` | 公众号凭证；不传则读 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` |
| `--` | 之后一律当文件路径（文件名以 `-` 开头时用） |
| `-h` / `-v` | `--help` / `--version` 的简写 |

支持 `--theme bold-blue` 和 `--theme=bold-blue` 两种写法。

### 输出约定（写脚本必看）

- **stdout 只有机器可读结果**：转换模式是 HTML 或 JSON，`--draft` 模式是 `mediaId`（或 `--json` 时是 JSON）。
- **人类可读的摘要、警告、报错一律走 stderr**，所以这三种写法都干净：

  ```bash
  wechat-md a.md > out.html
  MEDIA=$(wechat-md a.md --draft --title T)
  wechat-md a.md --json > out.json
  ```

- **退出码**：`0` 成功 / `1` 运行失败（渲染异常、微信接口报错）/ `2` 参数有误。

### 参数写错不会静默失败

主题名（48 个）、配色名（82 个）、字号、背景这几个参数都会**先校验再执行**，
拼错时直接退出码 2 并把候选报出来，不再静默回退到默认值：

```console
$ wechat-md a.md --theme bol-blue
✗ --theme 的值 "bol-blue" 不认识（是不是想用 bold-blue？）
  可用值：default bytedance apple sports chinese cyber …（共 48 个）

运行 cli-convert --help 查看用法。
```

未知选项同理（`--them` → 提示「是不是想用 `--theme`」）；多个问题会**一次性全部列出**，
不用改一个跑一次。既没给文件、stdin 又不是管道时也不会阻塞等输入，而是直接告诉你怎么用。

## 10. Agent 怎么用

**能用，而且有一条比给人用更顺的路径。**

### 认知前提

`/api/convert` 的产物终点是**浏览器剪贴板**——人用是「复制 → 去公众号后台粘贴」。
Agent 没有剪贴板，所以 agent **不要**试图用 `/api/convert` 完成"发布"这件事。
Agent 的正解是 `/api/wechat/draft`：**Markdown 进，草稿箱出**，全程 HTTP，无浏览器。

### 四条路径，按场景选

| 路径 | 适用 | 代价 |
| --- | --- | --- |
| **CLI**（§9） | 一次性转换、不需要常驻进程、无状态 agent | 需能执行子进程；每次调用都是冷启动 |
| **HTTP**（§5/§8） | 高频调用、多客户端共用 | 需先把服务拉起并保活 |
| **代码内 import** | 你自己写 Node 工具链 | `import { convertMarkdown } from './src/renderer'`；Python 侧只能走 CLI 或 HTTP |
| **封成 MCP server** | 让 agent 以结构化工具直接调用 | 需要额外开发 |

> **CLI 冷启动很贵**：每次调用都要重新加载 48 套主题 + 82 份配色 + jsdom/postcss 依赖树。
> 本机（沙箱内）实测 **单次约 40 秒** —— 根因是沙箱的文件系统代理让每次文件访问约 25ms
> （实测读 82 个 CSS 共 78KB 耗时 2.2 秒），而 CLI 要发起上千次文件访问，于是被放大约两个数量级。
> 原生环境应在 1 秒量级。
> **判据：如果一次任务里要转换/推送多次，用 HTTP 常驻服务；只做一两次就用 CLI。**

### 推荐给 agent 的最小闭环

**有常驻服务时**（推荐）：

```
1. 本地读 Markdown
2. POST /api/wechat/verify   → 确认凭证可用（可选，但能省掉一次白跑）
3. POST /api/wechat/draft    → 拿 mediaId
4. 回报「草稿已创建，去公众号后台草稿箱查看」
```

**完全不想起服务时**，同一条闭环用 CLI 一条命令完成：

```bash
MEDIA=$(wechat-md article.md --draft --title "标题" --cover https://example.com/c.png)
```

无需 `/api/convert`，也无需浏览器。

### 无状态 agent 的写法（不开常驻服务）

```python
import json, subprocess

CLI = "md2wechat/studio/dist/cli-convert.js"

def _run(args: list[str], markdown: str | None = None) -> str:
    out = subprocess.run(
        [CLI, *args], input=markdown, capture_output=True, text=True, encoding="utf-8",
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip())   # 报错在 stderr，退出码非 0
    return out.stdout                             # stdout 只有机器可读结果

def md_to_wechat_html(markdown: str, theme: str = "default") -> str:
    """Markdown -> 微信可用 HTML，一次子进程调用。"""
    return json.loads(_run(["--theme", theme, "--json"], markdown))["html"]

def push_draft(markdown: str, title: str, cover: str, *, theme: str = "default") -> str:
    """Markdown -> 公众号草稿，返回 media_id。凭证走 WECHAT_APP_ID / WECHAT_APP_SECRET。"""
    # 不带 --json 时 stdout 直接就是 media_id 本身
    return _run(
        ["--draft", "--title", title, "--cover", cover, "--theme", theme],
        markdown,
    ).strip()

def push_draft_verbose(markdown: str, title: str, cover: str) -> dict:
    """需要上传了几张图、有无失败等细节时，加 --json。"""
    return json.loads(_run(["--json", "--draft", "--title", title, "--cover", cover], markdown))
```

### 给 agent 的三条注意事项

1. **成败判据分两种**：走 HTTP 时看响应体的 `code`（HTTP 200 也可能是 `code: 400`，别只看状态码）；
   走 CLI 时看**退出码**（`0` 成功 / `1` 运行失败 / `2` 参数有误），报错内容在 stderr。
2. **40164 ≠ 代码问题**，是 IP 白名单没配。遇到就把「本机公网 IP」（§6）报给用户，别重试。
3. **正文图上传失败不阻断**（返回在 `failedImages` 里）。草稿建好了要如实说明哪几张图没传上去。

## 11. 错误码

| code | HTTP | 场景 |
| --- | --- | --- |
| `0` | 200 | 成功 |
| `1` | 400 | 微信接口失败（凭证错 / 40164 / 素材超限等），`msg` 带原始 errcode |
| `400` | 400 | 请求体不是合法 JSON，或缺 `markdown` / `title` |
| `401` | 401 | API Key 不对 |
| `413` | 413 | 请求体超过 256 KB |
| `500` | 500 | 渲染失败，`msg` 带异常信息 |

## 12. 本机调试注意

- 本机有 HTTP 代理劫持，`curl` 访问 localhost 要加 `--noproxy '*'`，Python 要用 `ProxyHandler({})`。
- **服务冷启动较慢**：模块加载期要读 48 套主题，本机实测 **45 秒以上**（沙箱文件系统代理会明显放大，正常环境应更快）。这段空窗里探测会全部失败、`lsof` 也看不到监听 —— **别误判成代码坏了**。用轮询探活再开始测试：

  ```bash
  for i in $(seq 1 30); do
    [ "$(curl -s --noproxy '*' -o /dev/null -m 3 -w '%{http_code}' http://127.0.0.1:8787/api/themes)" = "200" ] && break
    sleep 2
  done
  ```
