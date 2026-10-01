/**
 * 微信公众号草稿推送。
 *
 * 走官方 HTTP API，不依赖浏览器。完整链路：
 *   stable_token 取 access_token
 *   -> media/uploadimg 把正文图片传成 mmbiz CDN 地址（换掉原图 src）
 *   -> material/add_material 传封面，拿 thumb_media_id
 *   -> draft/add 建草稿
 *
 * 两个坑：
 *  1. 调用方的出口 IP 必须加进公众号后台的「IP 白名单」，否则报 40164。
 *  2. access_token 全局唯一且有频次限制，必须缓存复用（这里缓存到过期前 5 分钟）。
 */
import process from 'node:process'

const API_BASE = `https://api.weixin.qq.com/cgi-bin`

export interface WeChatCredentials {
  appId: string
  appSecret: string
}

interface WeChatError {
  errcode: number
  errmsg: string
}

/** 公众号接口的错误，带上原始 errcode 便于排查（40164 = IP 不在白名单） */
export class WeChatApiError extends Error {
  readonly errcode: number

  constructor(endpoint: string, errcode: number, errmsg: string) {
    super(`微信公众号接口 ${endpoint} 失败: [${errcode}] ${errmsg}`)
    this.name = `WeChatApiError`
    this.errcode = errcode
  }
}

async function parseJson<T>(endpoint: string, response: Response): Promise<T> {
  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  }
  catch {
    throw new Error(`微信公众号接口 ${endpoint} 返回了非 JSON 响应: ${text.slice(0, 200)}`)
  }
  const maybeError = payload as Partial<WeChatError>
  if (typeof maybeError.errcode === `number` && maybeError.errcode !== 0) {
    throw new WeChatApiError(endpoint, maybeError.errcode, maybeError.errmsg ?? `未知错误`)
  }
  return payload as T
}

/* ------------------------------------------------------------------ */
/* access_token 缓存                                                    */
/* ------------------------------------------------------------------ */

interface CachedToken {
  token: string
  expiresAt: number
}

const tokenCache = new Map<string, CachedToken>()

export async function getAccessToken(cred: WeChatCredentials, forceRefresh = false): Promise<string> {
  const key = `${cred.appId}:${cred.appSecret}`
  const cached = tokenCache.get(key)
  // 提前 5 分钟过期，避免边界上用到失效 token
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 5 * 60 * 1000)
    return cached.token

  const response = await fetch(`${API_BASE}/stable_token`, {
    method: `POST`,
    headers: { 'Content-Type': `application/json` },
    body: JSON.stringify({
      grant_type: `client_credential`,
      appid: cred.appId,
      secret: cred.appSecret,
      force_refresh: forceRefresh,
    }),
  })

  const data = await parseJson<{ access_token: string, expires_in: number }>(`stable_token`, response)
  tokenCache.set(key, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  })
  return data.access_token
}

/* ------------------------------------------------------------------ */
/* 图片上传                                                             */
/* ------------------------------------------------------------------ */

async function postMultipart<T>(
  endpoint: string,
  url: string,
  fieldName: string,
  data: Uint8Array,
  filename: string,
): Promise<T> {
  const form = new FormData()
  // Uint8Array -> Blob，Node 18+ 原生支持
  form.append(fieldName, new Blob([data as BlobPart]), filename)

  const response = await fetch(url, { method: `POST`, body: form })
  return parseJson<T>(endpoint, response)
}

/**
 * 上传「正文内图片」，返回 mmbiz.qpic.cn 的 URL。
 * 这种图片不占用永久素材额度，但只能用于图文正文。
 */
export async function uploadContentImage(
  cred: WeChatCredentials,
  data: Uint8Array,
  filename = `image.png`,
): Promise<string> {
  const token = await getAccessToken(cred)
  const result = await postMultipart<{ url: string }>(
    `media/uploadimg`,
    `${API_BASE}/media/uploadimg?access_token=${token}`,
    `media`,
    data,
    filename,
  )
  return result.url
}

/** 上传「永久图片素材」，返回 media_id —— 封面（thumb_media_id）用它 */
export async function uploadThumbMaterial(
  cred: WeChatCredentials,
  data: Uint8Array,
  filename = `cover.png`,
): Promise<string> {
  const token = await getAccessToken(cred)
  const result = await postMultipart<{ media_id: string }>(
    `material/add_material`,
    `${API_BASE}/material/add_material?access_token=${token}&type=image`,
    `media`,
    data,
    filename,
  )
  return result.media_id
}

/* ------------------------------------------------------------------ */
/* 草稿                                                                 */
/* ------------------------------------------------------------------ */

export interface DraftArticle {
  title: string
  author?: string
  digest?: string
  /** 正文 HTML（微信可用的内联样式版本） */
  content: string
  contentSourceUrl?: string
  thumbMediaId?: string
  needOpenComment?: boolean
  onlyFansCanComment?: boolean
}

export async function addDraft(cred: WeChatCredentials, article: DraftArticle): Promise<string> {
  const token = await getAccessToken(cred)
  const response = await fetch(`${API_BASE}/draft/add?access_token=${token}`, {
    method: `POST`,
    headers: { 'Content-Type': `application/json` },
    // 微信要求中文不走 unicode 转义
    body: JSON.stringify({
      articles: [{
        title: article.title,
        author: article.author ?? ``,
        digest: article.digest ?? ``,
        content: article.content,
        content_source_url: article.contentSourceUrl ?? ``,
        thumb_media_id: article.thumbMediaId ?? ``,
        need_open_comment: article.needOpenComment ? 1 : 0,
        only_fans_can_comment: article.onlyFansCanComment ? 1 : 0,
      }],
    }),
  })
  const data = await parseJson<{ media_id: string }>(`draft/add`, response)
  return data.media_id
}

/* ------------------------------------------------------------------ */
/* 正文图片本地化                                                        */
/* ------------------------------------------------------------------ */

/** 从 HTML 里取出所有 <img> 的 src（去重，保序） */
export function extractImageSources(html: string): string[] {
  const found: string[] = []
  const regex = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi
  for (const match of html.matchAll(regex)) {
    const src = match[1]
    if (src && !src.startsWith(`data:`) && !found.includes(src))
      found.push(src)
  }
  return found
}

async function downloadImage(url: string): Promise<{ data: Uint8Array, filename: string }> {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`下载图片失败 ${url}: HTTP ${response.status}`)
  const buffer = new Uint8Array(await response.arrayBuffer())
  const pathname = new URL(url).pathname
  const rawName = pathname.split(`/`).pop() || `image.png`
  return { data: buffer, filename: rawName.includes(`.`) ? rawName : `image.png` }
}

/**
 * 把正文里的外链图片全部传到微信 CDN，并替换 src。
 * 微信不接受外域图片直接出现在草稿里 —— 不换会被过滤掉。
 */
export async function localizeImages(
  cred: WeChatCredentials,
  html: string,
): Promise<{ html: string, uploaded: number, failed: string[] }> {
  const sources = extractImageSources(html)
  const failed: string[] = []
  let output = html
  let uploaded = 0

  for (const src of sources) {
    try {
      const { data, filename } = await downloadImage(src)
      const wechatUrl = await uploadContentImage(cred, data, filename)
      // src 里可能含 & / ? 等，替换时用全局字面量
      output = output.split(src).join(wechatUrl)
      uploaded++
    }
    catch (error) {
      failed.push(`${src} -> ${(error as Error).message}`)
    }
  }

  return { html: output, uploaded, failed }
}

/** 取默认封面：正文第一张图；没有就用调用方传入的 */
export async function resolveCoverMediaId(
  cred: WeChatCredentials,
  coverUrl: string,
  html: string,
): Promise<string | undefined> {
  let target = coverUrl
  if (!target) {
    const first = extractImageSources(html)[0]
    if (!first)
      return undefined
    target = first
  }

  const { data, filename } = await downloadImage(target)
  return uploadThumbMaterial(cred, data, filename)
}

/** 出口 IP 查询，方便用户往公众号后台加白名单 */
export async function getPublicIp(): Promise<string | undefined> {
  try {
    const response = await fetch(`https://api.ipify.org`, { signal: AbortSignal.timeout(5000) })
    return (await response.text()).trim()
  }
  catch {
    return undefined
  }
}

export function describeWeChatError(error: unknown): string {
  if (error instanceof WeChatApiError && error.errcode === 40164) {
    return `${error.message}\n提示：该错误表示调用方 IP 不在公众号的 IP 白名单内。`
      + `请到「公众号后台 -> 设置与开发 -> 基本配置 -> IP 白名单」把本机公网 IP 加进去。`
  }
  return (error as Error).message
}

// 允许通过环境变量注入，避免把密钥写进代码
export function credentialsFromEnv(): WeChatCredentials | undefined {
  const appId = process.env.WECHAT_APP_ID
  const appSecret = process.env.WECHAT_APP_SECRET
  if (appId && appSecret)
    return { appId, appSecret }
  return undefined
}
