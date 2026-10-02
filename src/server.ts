/**
 * HTTP 服务：编辑器页面 + Convert API + 公众号草稿推送。
 *
 * 启动：node dist/server.js      (默认 http://127.0.0.1:8787)
 * 环境变量：
 *   PORT            监听端口，默认 8787
 *   HOST            监听地址，默认 127.0.0.1
 *   MD2WECHAT_API_KEY  设置后 /api/convert 需要带密钥（不设置则本地免鉴权）
 *   WECHAT_APP_ID / WECHAT_APP_SECRET  公众号凭证默认值（也可在请求里传）
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { convertMarkdown } from './renderer'
import { listThemes } from './themes'
import { DEFAULT_CODE_THEME, listCodeThemes } from './code-theme'
import {
  credentialsFromEnv,
  describeWeChatError,
  getAccessToken,
  getPublicIp,
  MissingCoverError,
  pushDraft,
  type WeChatCredentials,
} from './wechat'

// 打包后 __dirname 是 dist/，public 在上一层
const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(HERE, `..`, `public`)

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? `127.0.0.1`
const REQUIRED_API_KEY = process.env.MD2WECHAT_API_KEY ?? ``

/** 请求体上限，和 md2wechat 保持一致的量级 */
const MAX_BODY_BYTES = 256 * 1024

const app = new Hono()

/* ------------------------------------------------------------------ */
/* 鉴权                                                                */
/* ------------------------------------------------------------------ */

/** 三种等价的密钥头，对齐 md2wechat 的约定 */
function extractApiKey(header: (name: string) => string | undefined): string {
  const direct = header(`Md2wechat-API-Key`) ?? header(`X-API-Key`)
  if (direct)
    return direct
  const auth = header(`Authorization`)
  if (auth?.startsWith(`Bearer `))
    return auth.slice(7).trim()
  return ``
}

const requireApiKey = async (c: any, next: any) => {
  if (!REQUIRED_API_KEY)
    return next()
  if (extractApiKey(name => c.req.header(name)) !== REQUIRED_API_KEY) {
    return c.json({ code: 401, msg: `invalid api key`, data: null }, 401)
  }
  return next()
}

/* ------------------------------------------------------------------ */
/* 页面与静态资源                                                       */
/* ------------------------------------------------------------------ */

app.get(`/`, (c) => {
  const indexFile = path.join(PUBLIC_DIR, `index.html`)
  if (!fs.existsSync(indexFile))
    return c.text(`编辑器尚未构建：缺少 public/index.html`, 500)
  return c.html(fs.readFileSync(indexFile, `utf8`))
})

app.use(`/static/*`, serveStatic({ root: PUBLIC_DIR }))

/* ------------------------------------------------------------------ */
/* Convert API                                                         */
/* ------------------------------------------------------------------ */

app.get(`/api/themes`, (c) => {
  return c.json({ code: 0, msg: `success`, data: { themes: listThemes() } })
})

app.get(`/api/code-themes`, (c) => {
  return c.json({
    code: 0,
    msg: `success`,
    data: { themes: listCodeThemes(), default: DEFAULT_CODE_THEME },
  })
})

app.post(`/api/convert`, requireApiKey, async (c) => {
  const raw = await c.req.text()
  if (raw.length > MAX_BODY_BYTES)
    return c.json({ code: 413, msg: `request body too large`, data: null }, 413)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  }
  catch {
    return c.json({ code: 400, msg: `invalid json body`, data: null }, 400)
  }

  const markdown = typeof body.markdown === `string` ? body.markdown : ``
  if (!markdown.trim())
    return c.json({ code: 400, msg: `markdown is required`, data: null }, 400)

  try {
    const result = convertMarkdown({
      markdown,
      theme: typeof body.theme === `string` ? body.theme : undefined,
      fontSize: typeof body.fontSize === `string` ? body.fontSize : undefined,
      backgroundType: typeof body.backgroundType === `string` ? body.backgroundType : undefined,
      codeTheme: typeof body.codeTheme === `string` ? body.codeTheme : undefined,
    })

    return c.json({
      code: 0,
      msg: `success`,
      data: {
        html: result.html,
        theme: result.theme,
        fontSize: result.fontSize,
        backgroundType: result.backgroundType,
        wordCount: result.wordCount,
        estimatedReadTime: result.estimatedReadTime,
        headings: result.headings,
      },
    })
  }
  catch (error) {
    console.error(`[convert] 渲染失败:`, error)
    return c.json({ code: 500, msg: `render failed: ${(error as Error).message}`, data: null }, 500)
  }
})

/* ------------------------------------------------------------------ */
/* 公众号草稿推送                                                       */
/* ------------------------------------------------------------------ */

/** 凭证优先取请求体，其次取环境变量 */
function resolveCredentials(body: Record<string, unknown>): WeChatCredentials | undefined {
  const appId = typeof body.appId === `string` ? body.appId.trim() : ``
  const appSecret = typeof body.appSecret === `string` ? body.appSecret.trim() : ``
  if (appId && appSecret)
    return { appId, appSecret }
  return credentialsFromEnv()
}

app.get(`/api/wechat/ip`, async (c) => {
  const ip = await getPublicIp()
  return c.json({
    code: ip ? 0 : 1,
    msg: ip ? `success` : `无法获取公网 IP`,
    data: {
      ip: ip ?? null,
      hint: `把这个 IP 加到「公众号后台 -> 设置与开发 -> 基本配置 -> IP 白名单」后才能推送草稿。`,
    },
  })
})

/** 校验凭证能否取到 access_token */
app.post(`/api/wechat/verify`, async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}))
  const cred = resolveCredentials(body)
  if (!cred)
    return c.json({ code: 400, msg: `缺少 AppID / AppSecret`, data: null }, 400)

  try {
    await getAccessToken(cred, true)
    return c.json({ code: 0, msg: `凭证有效`, data: { ok: true } })
  }
  catch (error) {
    return c.json({ code: 1, msg: describeWeChatError(error), data: { ok: false } }, 400)
  }
})

app.post(`/api/wechat/draft`, requireApiKey, async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}))

  const cred = resolveCredentials(body)
  if (!cred)
    return c.json({ code: 400, msg: `缺少 AppID / AppSecret`, data: null }, 400)

  const markdown = typeof body.markdown === `string` ? body.markdown : ``
  const title = typeof body.title === `string` ? body.title.trim() : ``
  if (!markdown.trim() || !title)
    return c.json({ code: 400, msg: `title 和 markdown 都不能为空`, data: null }, 400)

  try {
    // 渲染参数必须和 /api/convert 保持一致，否则预览与草稿会不一致；
    // 管线细节见 wechat.ts 的 pushDraft（CLI 走的是同一个函数）
    const result = await pushDraft(cred, {
      title,
      markdown,
      author: typeof body.author === `string` ? body.author : undefined,
      digest: typeof body.digest === `string` ? body.digest : undefined,
      contentSourceUrl: typeof body.contentSourceUrl === `string` ? body.contentSourceUrl : undefined,
      coverImageUrl: typeof body.coverImageUrl === `string` ? body.coverImageUrl : undefined,
      needOpenComment: body.needOpenComment === true,
      onlyFansCanComment: body.onlyFansCanComment === true,
      theme: typeof body.theme === `string` ? body.theme : undefined,
      fontSize: typeof body.fontSize === `string` ? body.fontSize : undefined,
      backgroundType: typeof body.backgroundType === `string` ? body.backgroundType : undefined,
      codeTheme: typeof body.codeTheme === `string` ? body.codeTheme : undefined,
    })

    return c.json({ code: 0, msg: `草稿创建成功`, data: result })
  }
  catch (error) {
    console.error(`[draft] 推送失败:`, error)
    // 封面缺失是「请求缺参数」，不是微信调用失败，给 400 更贴切
    const code = error instanceof MissingCoverError ? 400 : 1
    return c.json({ code, msg: describeWeChatError(error), data: null }, 400)
  }
})

/* ------------------------------------------------------------------ */

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`微信公众号排版服务已启动`)
  console.log(`  编辑器   http://${HOST}:${info.port}/`)
  console.log(`  转换接口 POST http://${HOST}:${info.port}/api/convert`)
  console.log(`  主题列表 GET  http://${HOST}:${info.port}/api/themes`)
  if (REQUIRED_API_KEY) {
    console.log(`  鉴权     已开启（请求需带 Md2wechat-API-Key）`)
  }
  else {
    console.log(`  鉴权     未开启（本机使用；如需对外请设置 MD2WECHAT_API_KEY）`)
  }
})
