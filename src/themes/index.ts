/**
 * 主题目录：对齐 md2wechat 的 48 个主题。
 *
 * 构成：6 个基础 + Minimal/Focus/Elegant/Bold 四个系列各 8 色（32 个）+ 10 个精选。
 * 32 个系列主题由「版式族 × 配色」程序化生成，避免手写 32 份重复定义。
 */
import { baseCSS, LAYOUTS } from './layouts'
import type { ThemeDefinition, ThemePalette } from './types'

export type { ThemeDefinition, ThemePalette } from './types'

/** 正文默认字体栈：中文优先，兼顾 macOS / Windows */
const FONT_FAMILY = `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif`

/** 四个批量系列共用的 8 套配色 */
const PALETTES: Record<string, { label: string, palette: ThemePalette }> = {
  gold: {
    label: `金色`,
    palette: { primary: `#a67c00`, text: `#3d3a33`, background: `#fdfaf3`, quoteBg: `#faf5e8`, quoteBorder: `#8a6600`, border: `#e8ddc4`, link: `#8a6600` },
  },
  green: {
    label: `绿色`,
    palette: { primary: `#388e3c`, text: `#333a34`, background: `#f6faf6`, quoteBg: `#edf6ee`, quoteBorder: `#2e7d32`, border: `#d5e6d7`, link: `#2e7d32` },
  },
  blue: {
    label: `蓝色`,
    palette: { primary: `#1976d2`, text: `#333a45`, background: `#f6f9fd`, quoteBg: `#edf4fb`, quoteBorder: `#1565c0`, border: `#d3e2f2`, link: `#1565c0` },
  },
  orange: {
    label: `橙色`,
    palette: { primary: `#ef6c00`, text: `#3d3733`, background: `#fdf8f4`, quoteBg: `#fdf0e6`, quoteBorder: `#e65100`, border: `#f0dcc9`, link: `#e65100` },
  },
  red: {
    label: `红色`,
    palette: { primary: `#d32f2f`, text: `#3d3434`, background: `#fdf6f6`, quoteBg: `#fdeeee`, quoteBorder: `#b71c1c`, border: `#f0d5d5`, link: `#c62828` },
  },
  navy: {
    label: `藏青`,
    palette: { primary: `#283593`, text: `#333747`, background: `#f6f7fd`, quoteBg: `#edf0fa`, quoteBorder: `#1a237e`, border: `#d5daf0`, link: `#1a237e` },
  },
  gray: {
    label: `灰色`,
    palette: { primary: `#546e7a`, text: `#3a4045`, background: `#f8f9fa`, quoteBg: `#eff2f4`, quoteBorder: `#37474f`, border: `#dde3e6`, link: `#455a64` },
  },
  sky: {
    label: `天蓝`,
    palette: { primary: `#039be5`, text: `#333d45`, background: `#f5fbfe`, quoteBg: `#e8f7fe`, quoteBorder: `#0288d1`, border: `#cfebf7`, link: `#0277bd` },
  },
}

/** 四个系列的版式说明（用于前端展示） */
const SERIES: Record<string, { label: string, desc: string }> = {
  minimal: { label: `极简系列`, desc: `干净克制，纯色文字无装饰` },
  focus: { label: `聚焦系列`, desc: `居中对称，标题上下双横线` },
  elegant: { label: `优雅系列`, desc: `层次丰富，左边框递减 + 渐变背景` },
  bold: { label: `醒目系列`, desc: `视觉冲击，标题满底色圆角投影` },
}

function buildSeriesThemes(): ThemeDefinition[] {
  const out: ThemeDefinition[] = []
  for (const [seriesKey, series] of Object.entries(SERIES)) {
    for (const [colorKey, { label: colorLabel, palette }] of Object.entries(PALETTES)) {
      out.push({
        name: `${seriesKey}-${colorKey}`,
        label: `${colorLabel}·${series.label.replace(`系列`, ``)}`,
        series: seriesKey,
        description: `${colorLabel}系，${series.desc}`,
        palette,
        layout: seriesKey,
      })
    }
  }
  return out
}

/** 6 个基础主题 */
const BASIC_THEMES: ThemeDefinition[] = [
  {
    name: `default`,
    label: `微信经典`,
    series: `basic`,
    description: `微信经典风格，温暖舒适`,
    layout: `basic-default`,
    palette: { primary: `#d4703a`, text: `#3f3b38`, background: `#fffdfa`, quoteBg: `#faf3ec`, quoteBorder: `#b8562a`, border: `#eadfd5`, link: `#b8562a` },
  },
  {
    name: `bytedance`,
    label: `科技现代`,
    series: `basic`,
    description: `科技现代风格，简洁利落`,
    layout: `basic-bytedance`,
    palette: { primary: `#3370ff`, text: `#1f2329`, background: `#ffffff`, quoteBg: `#f3f5f8`, quoteBorder: `#3370ff`, border: `#e3e6eb`, link: `#3370ff` },
  },
  {
    name: `apple`,
    label: `渐变优雅`,
    series: `basic`,
    description: `视觉渐变风格，精致优雅`,
    layout: `basic-apple`,
    palette: { primary: `#0071e3`, text: `#1d1d1f`, background: `#fbfbfd`, quoteBg: `#f5f5f7`, quoteBorder: `#0a5ec2`, border: `#e3e3e6`, link: `#0071e3` },
  },
  {
    name: `sports`,
    label: `活力动感`,
    series: `basic`,
    description: `活力动感风格，充满能量`,
    layout: `basic-sports`,
    palette: { primary: `#f4511e`, text: `#33302e`, background: `#fffaf7`, quoteBg: `#fff1ea`, quoteBorder: `#e64a19`, border: `#f5dcd2`, link: `#e64a19` },
  },
  {
    name: `chinese`,
    label: `古典雅致`,
    series: `basic`,
    description: `古典雅致风格，书卷气息`,
    layout: `basic-chinese`,
    palette: { primary: `#8c6239`, text: `#3a352c`, background: `#fbf8f2`, quoteBg: `#f5efe2`, quoteBorder: `#6d4c2f`, border: `#e2d8c3`, link: `#6d4c2f` },
  },
  {
    name: `cyber`,
    label: `未来霓虹`,
    series: `basic`,
    description: `未来科技风格，霓虹光影`,
    layout: `basic-cyber`,
    // 深色主题配深色代码块才不突兀
    codeTheme: `github-dark`,
    palette: { primary: `#00e5ff`, text: `#c8d4e0`, background: `#0f1620`, quoteBg: `#17222f`, quoteBorder: `#00e5ff`, border: `#24333f`, link: `#22d3ee` },
  },
]

/** 10 个精选主题 */
const FEATURED_THEMES: ThemeDefinition[] = [
  {
    name: `sspai-red`,
    label: `少数派红`,
    series: `featured`,
    description: `少数派红色风格，利落醒目`,
    layout: `f-sspai-red`,
    palette: { primary: `#d92f2f`, text: `#2c2c2c`, background: `#ffffff`, quoteBg: `#faf2f2`, quoteBorder: `#b32222`, border: `#ecd9d9`, link: `#b32222` },
  },
  {
    name: `wechat-native`,
    label: `微信原生`,
    series: `featured`,
    description: `微信公众号原生，官方绿底纹，稳妥之选`,
    layout: `f-wechat-native`,
    palette: { primary: `#07c160`, text: `#3e3e3e`, background: `#ffffff`, quoteBg: `#edf9f1`, quoteBorder: `#07c160`, border: `#d9f0e2`, link: `#07c160` },
  },
  {
    name: `nyt-classic`,
    label: `新闻纸`,
    series: `featured`,
    description: `经典米黄新闻纸，严肃深度报道的专业感`,
    layout: `f-nyt-classic`,
    palette: { primary: `#111111`, text: `#1a1a1a`, background: `#fbf7ef`, quoteBg: `#f3ecdd`, quoteBorder: `#111111`, border: `#e0d6c2`, link: `#333333` },
  },
  {
    name: `github-readme`,
    label: `开发者 README`,
    series: `featured`,
    description: `开发者最熟悉的阅读界面，README 即视感`,
    layout: `f-github-readme`,
    palette: { primary: `#0969da`, text: `#1f2328`, background: `#ffffff`, quoteBg: `#f6f8fa`, quoteBorder: `#d0d7de`, border: `#d0d7de`, link: `#0969da` },
  },
  {
    name: `mint-fresh`,
    label: `薄荷清透`,
    series: `featured`,
    description: `清凉薄荷绿底色，适合生活方式与健康类内容`,
    layout: `f-mint-fresh`,
    palette: { primary: `#2bb673`, text: `#33413a`, background: `#f7fdfa`, quoteBg: `#e6f7ef`, quoteBorder: `#1f9d5f`, border: `#cdeade`, link: `#1f9d5f` },
  },
  {
    name: `sunset-amber`,
    label: `琥珀黄昏`,
    series: `featured`,
    description: `暖琥珀色调的黄昏意境，散文游记与情感表达`,
    layout: `f-sunset-amber`,
    palette: { primary: `#f59e0b`, text: `#3d372c`, background: `#fffbf5`, quoteBg: `#fdf2dd`, quoteBorder: `#d97706`, border: `#f0e0c2`, link: `#b45309` },
  },
  {
    name: `ink-minimal`,
    label: `水墨黑白`,
    series: `featured`,
    description: `纯粹的黑白水墨风，零色彩干扰的极简阅读`,
    layout: `f-ink-minimal`,
    palette: { primary: `#2b2b2b`, text: `#2b2b2b`, background: `#ffffff`, quoteBg: `#f5f5f5`, quoteBorder: `#2b2b2b`, border: `#dddddd`, link: `#555555` },
  },
  {
    name: `lavender-dream`,
    label: `梦幻紫罗兰`,
    series: `featured`,
    description: `梦幻紫色调的浪漫氛围，诗意与灵感的温柔表达`,
    layout: `f-lavender-dream`,
    palette: { primary: `#7c5cd6`, text: `#3a3547`, background: `#faf9fe`, quoteBg: `#f1eefb`, quoteBorder: `#6246c4`, border: `#e0daf3`, link: `#6246c4` },
  },
  {
    name: `coffee-house`,
    label: `咖啡馆`,
    series: `featured`,
    description: `醇厚巧克力棕色调，午后咖啡馆的温暖书卷气`,
    layout: `f-coffee-house`,
    palette: { primary: `#6f4e37`, text: `#3b322b`, background: `#fbf8f4`, quoteBg: `#f3ece4`, quoteBorder: `#4e342e`, border: `#e3d8cb`, link: `#4e342e` },
  },
  {
    name: `bauhaus-primary`,
    label: `包豪斯`,
    series: `featured`,
    description: `包豪斯三原色风格，红蓝黄碰撞的现代主义先锋`,
    layout: `f-bauhaus-primary`,
    palette: { primary: `#e63946`, text: `#1f1f1f`, background: `#fdfdfd`, quoteBg: `#f4f4f4`, quoteBorder: `#1d3557`, border: `#e0e0e0`, link: `#1d3557` },
  },
]

export const THEMES: ThemeDefinition[] = [
  ...BASIC_THEMES,
  ...buildSeriesThemes(),
  ...FEATURED_THEMES,
]

const THEME_MAP = new Map(THEMES.map(t => [t.name, t]))

/** 取主题定义；名字不存在时回退到 default */
export function resolveTheme(name?: string): ThemeDefinition {
  if (name && THEME_MAP.has(name))
    return THEME_MAP.get(name)!
  return THEME_MAP.get(`default`)!
}

export interface BuildThemeOptions {
  fontSize: string
  /** 背景类型等运行时覆盖样式，追加在最后 */
  extra?: string
}

/** 组装完整主题 CSS：底座 + 版式 + 主题专属 + 运行时覆盖 */
export function buildThemeCSS(theme: ThemeDefinition, options: BuildThemeOptions): string {
  const layout = LAYOUTS[theme.layout]
  if (!layout)
    throw new Error(`主题 ${theme.name} 引用了未注册的版式: ${theme.layout}`)

  return [
    baseCSS(theme.palette, { fontFamily: FONT_FAMILY, fontSize: options.fontSize }),
    layout(theme.palette),
    theme.extra ?? ``,
    options.extra ?? ``,
  ].filter(Boolean).join(`\n\n`)
}

/** 供 API / 前端枚举主题用的精简信息 */
export function listThemes() {
  return THEMES.map(t => ({
    name: t.name,
    label: t.label,
    series: t.series,
    description: t.description,
    primaryColor: t.palette.primary,
    background: t.palette.background,
  }))
}
