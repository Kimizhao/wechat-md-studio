# 接口文档

本服务把 Markdown 渲染成**微信公众号可用的全内联样式 HTML**，并提供草稿推送。
编辑器、HTTP 接口、命令行工具走的是**同一条渲染管线**，结果一致。

## 0. 启动

```bash
cd md2wechat/studio
node build.mjs          # 构建（改过源码后需要）
node dist/server.js     # 启动，默认 http://127.0.0.1:8787
```

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址。对外提供服务时改 `0.0.0.0` |
| `MD2WECHAT_API_KEY` | 空 | 设置后 `/api/convert` 与 `/api/wechat/draft` 需要密钥；不设置则本机免鉴权 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 空 | 公众号凭证默认值，请求体里传了就以请求体为准 |

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
  "data": { "ip": "142.249.39.220", "hint": "把这个 IP 加到「公众号后台 -> 设置与开发 -> 基本配置 -> IP 白名单」后才能推送草稿。" } }
```

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
| `title` | ✅ | 标题，公众号最多 64 字 |
| `markdown` | ✅ | 正文 Markdown，服务端自己渲染 |
| `appId` / `appSecret` |  | 不传则取环境变量 |
| `author` / `digest` / `contentSourceUrl` | | 作者 / 摘要（留空由微信截取）/ 原文链接 |
| `coverImageUrl` | | 封面图 URL；留空取正文第一张图 |
| `theme` / `fontSize` / `backgroundType` / `codeTheme` | | 与 `/api/convert` 完全一致 |

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

## 9. 命令行（不起服务也能用）

适合脚本、CI、以及**没有常驻服务的 agent**。

```bash
# 文件 -> HTML
node dist/cli-convert.js article.md --theme bold-blue --font-size large > out.html

# stdin -> stdout
cat article.md | node dist/cli-convert.js --theme focus-green

# 结构化输出（含 wordCount / headings）
node dist/cli-convert.js article.md --json

# 列出全部主题
node dist/cli-convert.js --list-themes

# 回归自检：把 48 套主题全渲染一遍并校验产物合法性
node dist/cli-convert.js --check-all
```

参数：`--theme` `--font-size` `--background-type` `--code-theme` `--json`
（不带 `--json` 时，统计信息走 stderr，HTML 走 stdout，所以重定向是干净的。）

## 10. Agent 怎么用

**能用，而且有一条比给人用更顺的路径。**

### 认知前提

`/api/convert` 的产物终点是**浏览器剪贴板**——人用是「复制 → 去公众号后台粘贴」。
Agent 没有剪贴板，所以 agent **不要**试图用 `/api/convert` 完成"发布"这件事。
Agent 的正解是 `/api/wechat/draft`：**Markdown 进，草稿箱出**，全程 HTTP，无浏览器。

### 四条路径，按场景选

| 路径 | 适用 | 代价 |
| --- | --- | --- |
| **CLI**（§9） | 一次性转换、不需要常驻进程 | 需能执行子进程；每次调用冷启动约 1–2s |
| **HTTP**（§5/§8） | 高频调用、多客户端共用 | 需先把服务拉起并保活 |
| **代码内 import** | 你自己写 Node 工具链 | `import { convertMarkdown } from './src/renderer'`；Python 侧只能走 CLI 或 HTTP |
| **封成 MCP server** | 让 agent 以结构化工具直接调用 | 需要额外开发 |

### 推荐给 agent 的最小闭环

```
1. 本地读 Markdown
2. POST /api/wechat/verify   → 确认凭证可用（可选，但能省掉一次白跑）
3. POST /api/wechat/draft    → 拿 mediaId
4. 回报「草稿已创建，去公众号后台草稿箱查看」
```

无需 `/api/convert`，也无需浏览器。

### 无状态 agent 的写法（不开常驻服务）

```python
import json, subprocess

def md_to_wechat_html(markdown: str, theme: str = "default") -> str:
    """一次子进程调用，无需服务常驻。"""
    out = subprocess.run(
        ["node", "dist/cli-convert.js", "--theme", theme, "--json"],
        input=markdown, capture_output=True, text=True, encoding="utf-8", cwd="md2wechat/studio",
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr)
    return json.loads(out.stdout)["html"]
```

### 给 agent 的三条注意事项

1. **`code` 才是成败判据**，HTTP 200 也可能是 `code: 400`。别只看状态码。
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
- 服务刚启动有 1–2 秒空窗（要在模块加载期读 48 套主题），此时探测会失败，隔一会儿重试即可。
