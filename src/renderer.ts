/**
 * 渲染内核：Markdown -> 微信公众号可用的「全内联样式」HTML。
 *
 * 微信后台会过滤 <style> / class / id，且会丢弃 var() 和 calc()，
 * 所以必须把主题 CSS 全部内联到每个元素的 style 属性上。完整管线：
 *
 *   marked 渲染（含代码高亮/脚注/GFM 警告块）
 *   -> 合并主题 CSS（底座 + 版式 + 运行时覆盖）
 *   -> juice 内联到 style 属性
 *   -> 结构后处理（列表平铺、图片尺寸）
 *
 * 编辑器预览与 /api/convert 走的是同一条管线，保证「所见即所得」。
 */
import { initRenderer } from '@md/core/renderer'
import { postProcessHtml, renderMarkdown } from '@md/core/utils'
import { loadCodeThemeCSS } from './code-theme'
import { buildThemeCSS, resolveTheme, type ThemeDefinition } from './themes'
import { inlineForWeChat } from './inline'

/** 字号档位 -> 实际 px（对齐 md2wechat 的 small/medium/large 三档） */
const FONT_SIZE_MAP = {
  small: `15px`,
  medium: `16px`,
  large: `17px`,
} as const

export type FontSizeKey = keyof typeof FONT_SIZE_MAP
export type BackgroundType = 'default' | 'grid' | 'none'

export interface ConvertOptions {
  markdown: string
  theme?: string
  fontSize?: string
  backgroundType?: string
  /** 代码块配色（highlight.js 样式名），不填用主题自带的 */
  codeTheme?: string
}

export interface Heading {
  level: number
  text: string
}

export interface ConvertResult {
  html: string
  theme: string
  fontSize: FontSizeKey
  backgroundType: BackgroundType
  wordCount: number
  estimatedReadTime: number
  headings: Heading[]
}

function normalizeFontSize(value?: string): FontSizeKey {
  return value === `small` || value === `large` ? value : `medium`
}

function normalizeBackground(value?: string): BackgroundType {
  return value === `grid` || value === `none` ? value : `default`
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace(`#`, ``)
  const full = raw.length === 3 ? raw.split(``).map(c => c + c).join(``) : raw
  const num = Number.parseInt(full, 16)
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}

/** md2wechat 口径：非空白字符数 */
function countWords(markdown: string): number {
  return markdown.replace(/\s/g, ``).length
}

/**
 * 背景类型：
 *  - default：用主题自带背景，不干预
 *  - none：强制透明，适合贴在白底页面上
 *  - grid：铺一层与主色同色系的淡网格
 */
function backgroundOverrides(type: BackgroundType, theme: ThemeDefinition): string {
  if (type === `none`)
    return `.container { background: transparent; background-image: none; }`

  if (type === `grid`) {
    const line = hexToRgba(theme.palette.primary, 0.06)
    return `.container {
  background-image: linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px);
  background-size: 24px 24px;
}`
  }

  return ``
}

export function convertMarkdown(options: ConvertOptions): ConvertResult {
  const markdown = options.markdown ?? ``
  const theme = resolveTheme(options.theme)
  const fontSizeKey = normalizeFontSize(options.fontSize)
  const backgroundType = normalizeBackground(options.backgroundType)

  const renderer = initRenderer({
    legend: `title`,
    citeStatus: false,
    countStatus: false,
    isMacCodeBlock: false,
    isShowLineNumber: false,
    themeMode: `light`,
  })

  // 1. Markdown -> 带 class 的结构化 HTML（含净化）
  const { html, readingTime } = renderMarkdown(markdown, renderer)
  const headings: Heading[] = renderer
    .getHeadings()
    .filter(h => h.level <= 3)
    .map(h => ({ level: h.level, text: h.text }))

  // 2. 补齐阅读时长、脚注，并包上 <section class="container">
  const containerHtml = postProcessHtml(html, readingTime, renderer)

  // 3. 组装主题 CSS：主题版式 + 代码高亮配色
  const codeThemeCSS = loadCodeThemeCSS(options.codeTheme ?? theme.codeTheme)
  const themeCSS = [
    buildThemeCSS(theme, {
      fontSize: FONT_SIZE_MAP[fontSizeKey],
      extra: backgroundOverrides(backgroundType, theme),
    }),
    codeThemeCSS,
  ].filter(Boolean).join(`\n\n`)

  // 4. juice 内联 -> 微信可用 HTML
  const wechatHtml = inlineForWeChat({
    themeCSS,
    containerHtml,
    // 主题 CSS 已全部插值为具体色值，这里只兜底 core 模板里残留的变量
    variables: {},
  })

  const wordCount = countWords(markdown)

  return {
    html: wechatHtml,
    theme: theme.name,
    fontSize: fontSizeKey,
    backgroundType,
    wordCount,
    estimatedReadTime: Math.max(1, Math.ceil(wordCount / 300)),
    headings,
  }
}
