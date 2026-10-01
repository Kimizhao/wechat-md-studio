/**
 * 版式注册表。
 *
 * 所有主题共享同一套「底座」（正文、列表、表格、图片、代码、链接），
 * 差异集中在标题、引用、强调这三处的排版规则上 —— 这正是主题的「气质」来源。
 * 色值全部在生成期直接插值成具体颜色，不用 var()/calc()，避免微信端解析不了。
 */
import type { ThemePalette } from './types'

function rgba(hex: string, alpha: number): string {
  const raw = hex.replace(`#`, ``)
  const full = raw.length === 3 ? raw.split(``).map(c => c + c).join(``) : raw
  const num = Number.parseInt(full, 16)
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}

/** 弱化色：正文色混白，用于图注、脚注、删除线 */
function muted(text: string): string {
  return rgba(text, 0.55)
}

interface BaseContext {
  fontFamily: string
  fontSize: string
}

/** 所有主题共用的底座样式 */
export function baseCSS(p: ThemePalette, ctx: BaseContext): string {
  const mono = `Menlo, Monaco, Consolas, 'Courier New', monospace`
  return `
.container {
  font-family: ${ctx.fontFamily};
  font-size: ${ctx.fontSize};
  line-height: 1.75;
  color: ${p.text};
  background: ${p.background};
  padding: 28px 16px;
  word-break: break-word;
  text-align: left;
}
h1, h2, h3, h4, h5, h6 {
  font-weight: bold;
  line-height: 1.45;
  color: ${p.primary};
}
p {
  margin: 1.3em 4px;
  color: ${p.text};
  letter-spacing: 0.04em;
}
p:first-child { margin-top: 0; }
ul, ol {
  margin: 1em 4px;
  padding-left: 1.4em;
  color: ${p.text};
}
ul { list-style-type: disc; }
ol { list-style-type: decimal; }
li {
  margin: 0.35em 0;
  color: ${p.text};
}
blockquote {
  margin: 1.3em 0;
  padding: 0.9em 1.1em;
  border-left: 4px solid ${p.quoteBorder};
  border-radius: 4px;
  background: ${p.quoteBg};
  color: ${p.text};
}
blockquote > p {
  margin: 0;
  font-size: 1em;
  color: ${p.text};
}
a { color: ${p.link}; text-decoration: none; }
strong { color: ${p.primary}; font-weight: bold; }
em { font-style: italic; }
del, .del { text-decoration: line-through; color: ${muted(p.text)}; }
hr {
  border: none;
  height: 1px;
  margin: 2em 0;
  background: linear-gradient(90deg, transparent, ${p.border}, transparent);
}
img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.2em auto;
  border-radius: 4px;
}
figure { margin: 1.4em 0; }
figcaption, .md-figcaption {
  margin-top: 0.5em;
  text-align: center;
  font-size: 0.85em;
  color: ${muted(p.text)};
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.3em 0;
  font-size: 0.95em;
}
th, td {
  border: 1px solid ${p.border};
  padding: 0.5em 0.65em;
  color: ${p.text};
  text-align: left;
}
th { background: ${p.quoteBg}; font-weight: bold; }
.codespan {
  font-family: ${mono};
  font-size: 0.9em;
  color: ${p.primary};
  background: ${p.quoteBg};
  padding: 2px 5px;
  border-radius: 3px;
  border: 1px solid ${p.border};
}
pre.code__pre, .hljs.code__pre {
  margin: 1.2em 0;
  padding: 0;
  border-radius: 6px;
  font-size: 0.9em;
  line-height: 1.6;
  overflow-x: auto;
  background: ${p.quoteBg};
}
pre.code__pre > code, .hljs.code__pre > code {
  display: block;
  padding: 1em 1.1em;
  overflow-x: auto;
  background: none;
  color: inherit;
  font-family: ${mono};
  white-space: pre;
}
p.footnotes { font-size: 0.85em; color: ${muted(p.text)}; }
.katex-inline, .katex-block { max-width: 100%; overflow-x: auto; }
.katex-block { padding: 0.5em 0; text-align: center; }
  `.trim()
}

type LayoutFn = (p: ThemePalette) => string

/* ============================================================
 * 四个批量系列
 * ============================================================ */

/** Minimal：干净克制，纯色文字，零装饰 */
const minimal: LayoutFn = p => `
h1 { font-size: 1.35em; margin: 2em 4px 1em; }
h2 { font-size: 1.2em; margin: 1.8em 4px 0.9em; }
h3 { font-size: 1.08em; margin: 1.5em 4px 0.7em; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 4px 0.6em; color: ${p.text}; }
blockquote {
  border: none;
  border-left: 3px solid ${p.primary};
  border-radius: 0;
  background: transparent;
  padding: 0.15em 0 0.15em 1em;
}
blockquote > p { color: ${muted(p.text)}; }
strong { color: ${p.primary}; }
`.trim()

/** Focus：居中对称，标题上下双横线 */
const focus: LayoutFn = p => `
h1 {
  text-align: center;
  font-size: 1.3em;
  margin: 2em 0 1.2em;
  padding: 0.4em 0;
  border-top: 2px solid ${p.primary};
  border-bottom: 2px solid ${p.primary};
}
h2 {
  text-align: center;
  font-size: 1.18em;
  margin: 1.8em 0 1em;
  padding: 0.34em 0;
  border-top: 1px solid ${p.primary};
  border-bottom: 1px solid ${p.primary};
}
h3 { font-size: 1.08em; margin: 1.6em 0 0.8em; text-align: center; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; text-align: center; color: ${p.text}; }
blockquote {
  border-left: 3px solid ${p.primary};
  border-right: 3px solid ${p.primary};
  border-radius: 0;
  background: ${p.quoteBg};
  text-align: center;
}
`.trim()

/** Elegant：层次丰富，左边框递减 + 渐变背景 */
const elegant: LayoutFn = p => `
h1 {
  font-size: 1.3em;
  margin: 1.9em 0 1em;
  padding: 0.35em 0.8em;
  border-left: 6px solid ${p.primary};
  background: linear-gradient(90deg, ${p.quoteBg}, transparent);
}
h2 {
  font-size: 1.18em;
  margin: 1.7em 0 0.9em;
  padding: 0.3em 0.75em;
  border-left: 5px solid ${p.primary};
  background: linear-gradient(90deg, ${p.quoteBg}, transparent);
}
h3 { font-size: 1.08em; margin: 1.5em 0 0.7em; padding-left: 0.7em; border-left: 4px solid ${p.primary}; }
h4 { font-size: 1em; margin: 1.3em 0 0.6em; padding-left: 0.6em; border-left: 3px solid ${p.primary}; }
h5, h6 { font-size: 1em; margin: 1.2em 0 0.5em; padding-left: 0.5em; border-left: 2px solid ${p.primary}; color: ${p.text}; }
blockquote {
  border-left: 5px solid ${p.quoteBorder};
  background: linear-gradient(90deg, ${p.quoteBg}, transparent);
}
`.trim()

/** Bold：标题满底色 + 圆角投影 */
const bold: LayoutFn = p => `
h1 {
  font-size: 1.28em;
  margin: 1.9em 0 1.1em;
  padding: 0.5em 0.9em;
  background: ${p.primary};
  color: #ffffff;
  border-radius: 10px;
  box-shadow: 0 6px 16px ${rgba(p.primary, 0.25)};
}
h2 {
  font-size: 1.16em;
  margin: 1.7em 0 1em;
  padding: 0.44em 0.8em;
  background: ${p.primary};
  color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 4px 12px ${rgba(p.primary, 0.22)};
}
h3 {
  font-size: 1.06em;
  margin: 1.5em 0 0.8em;
  padding: 0.36em 0.7em;
  background: ${p.quoteBg};
  color: ${p.primary};
  border-left: 4px solid ${p.primary};
  border-radius: 6px;
}
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.primary}; }
blockquote {
  border-left: none;
  border-radius: 8px;
  background: ${p.quoteBg};
  box-shadow: inset 0 0 0 1px ${p.border};
}
blockquote > p { color: ${p.text}; }
`.trim()

/* ============================================================
 * 六个基础主题
 * ============================================================ */

/** default：微信经典，温暖舒适 */
const basicDefault: LayoutFn = p => `
h1 {
  font-size: 1.25em;
  margin: 2em auto 1em;
  padding-bottom: 0.3em;
  border-bottom: 2px solid ${p.primary};
  text-align: center;
}
h2 {
  font-size: 1.15em;
  margin: 1.8em auto 1em;
  padding: 0.2em 0.7em;
  background: ${p.primary};
  color: #ffffff;
  border-radius: 3px;
  text-align: center;
}
h3 {
  font-size: 1.08em;
  margin: 1.6em 0 0.8em;
  padding-left: 0.6em;
  border-left: 3px solid ${p.primary};
}
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; }
`.trim()

/** bytedance：科技现代，简洁利落 */
const basicBytedance: LayoutFn = p => `
h1, h2, h3, h4, h5, h6 { text-align: left; letter-spacing: -0.01em; }
h1 { font-size: 1.32em; margin: 2em 0 1em; padding-bottom: 0.35em; border-bottom: 3px solid ${p.primary}; }
h2 { font-size: 1.18em; margin: 1.8em 0 0.9em; padding-left: 0.55em; border-left: 4px solid ${p.primary}; }
h3 { font-size: 1.06em; margin: 1.5em 0 0.7em; color: ${p.text}; font-weight: 600; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote { border-left: 4px solid ${p.primary}; border-radius: 0; background: ${p.quoteBg}; }
`.trim()

/** apple：视觉渐变，精致优雅 */
const basicApple: LayoutFn = p => `
h1 {
  font-size: 1.3em;
  margin: 2em 0 1.1em;
  padding: 0.42em 0.9em;
  border-radius: 12px;
  color: #ffffff;
  background: linear-gradient(135deg, ${p.primary}, ${p.quoteBorder});
  box-shadow: 0 8px 20px ${rgba(p.primary, 0.22)};
}
h2 {
  font-size: 1.16em;
  margin: 1.7em 0 0.95em;
  padding-left: 0.7em;
  border-left: 4px solid ${p.primary};
  background: linear-gradient(90deg, ${p.quoteBg}, transparent);
}
h3 { font-size: 1.07em; margin: 1.5em 0 0.7em; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote { border-left: 4px solid ${p.primary}; border-radius: 10px; background: ${p.quoteBg}; }
`.trim()

/** sports：活力动感，充满能量 */
const basicSports: LayoutFn = p => `
h1 {
  font-size: 1.32em;
  font-style: italic;
  margin: 2em 0 1.1em;
  padding: 0.3em 0.8em;
  border-left: 8px solid ${p.primary};
  background: linear-gradient(90deg, ${p.quoteBg}, transparent);
}
h2 {
  font-size: 1.18em;
  margin: 1.7em 0 0.95em;
  padding: 0.18em 0;
  border-bottom: 3px solid ${p.primary};
  font-style: italic;
}
h3 { font-size: 1.07em; margin: 1.5em 0 0.7em; padding-left: 0.55em; border-left: 3px solid ${p.primary}; font-style: italic; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote { border-left: 6px solid ${p.primary}; border-radius: 0; background: ${p.quoteBg}; font-style: italic; }
`.trim()

/** chinese：古典雅致，书卷气息 */
const basicChinese: LayoutFn = p => `
h1 {
  font-size: 1.28em;
  margin: 2em auto 1.1em;
  padding: 0.45em 0;
  text-align: center;
  border-top: 1px solid ${p.border};
  border-bottom: 1px solid ${p.border};
  letter-spacing: 0.18em;
}
h2 {
  font-size: 1.16em;
  margin: 1.8em 0 0.95em;
  padding: 0.22em 0.8em;
  border-left: 4px solid ${p.primary};
  background: ${p.quoteBg};
  letter-spacing: 0.1em;
}
h3 { font-size: 1.07em; margin: 1.5em 0 0.7em; letter-spacing: 0.08em; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; letter-spacing: 0.08em; }
p { letter-spacing: 0.1em; }
blockquote { border-left: 3px solid ${p.quoteBorder}; border-radius: 0; background: ${p.quoteBg}; letter-spacing: 0.1em; }
`.trim()

/** cyber：未来科技，霓虹光影 */
const basicCyber: LayoutFn = p => `
h1 {
  font-size: 1.3em;
  margin: 2em 0 1.1em;
  padding: 0.4em 0.85em;
  color: #ffffff;
  background: ${p.primary};
  border-radius: 4px;
  text-shadow: 0 0 12px ${rgba(p.primary, 0.85)};
  box-shadow: 0 0 18px ${rgba(p.primary, 0.35)};
}
h2 {
  font-size: 1.17em;
  margin: 1.7em 0 0.95em;
  padding-left: 0.65em;
  border-left: 4px solid ${p.primary};
  text-shadow: 0 0 10px ${rgba(p.primary, 0.5)};
}
h3 { font-size: 1.07em; margin: 1.5em 0 0.7em; text-shadow: 0 0 8px ${rgba(p.primary, 0.35)}; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote {
  border-left: 4px solid ${p.primary};
  background: ${p.quoteBg};
  box-shadow: inset 0 0 14px ${rgba(p.primary, 0.12)};
}
strong { color: ${p.primary}; text-shadow: 0 0 8px ${rgba(p.primary, 0.45)}; }
`.trim()

/* ============================================================
 * 十个精选主题
 * ============================================================ */

/** sspai-red：少数派红，利落醒目 */
const fSspaiRed: LayoutFn = p => `
h1 { font-size: 1.3em; margin: 2em 0 1em; padding-left: 0.75em; border-left: 6px solid ${p.primary}; }
h2 { font-size: 1.16em; margin: 1.7em 0 0.95em; padding: 0.3em 0.7em; background: ${p.primary}; color: #ffffff; border-radius: 4px; }
h3 { font-size: 1.06em; margin: 1.5em 0 0.7em; padding-bottom: 0.25em; border-bottom: 2px solid ${rgba(p.primary, 0.35)}; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote { border-left: 4px solid ${p.primary}; border-radius: 0; background: ${p.quoteBg}; }
`.trim()

/** wechat-native：微信公众号原生，官方绿底纹 */
const fWechatNative: LayoutFn = p => `
h1 { font-size: 1.24em; margin: 2em auto 1em; padding-bottom: 0.3em; border-bottom: 2px solid ${p.primary}; text-align: center; }
h2 {
  font-size: 1.14em;
  margin: 1.8em auto 1em;
  padding: 0.24em 0.8em;
  background: ${p.primary};
  color: #ffffff;
  text-align: center;
  border-radius: 2px;
}
h3 { font-size: 1.06em; margin: 1.6em 0 0.8em; padding-left: 0.6em; border-left: 3px solid ${p.primary}; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; }
blockquote { border-left: 4px solid ${p.primary}; border-radius: 0; background: ${p.quoteBg}; }
`.trim()

/** nyt-classic：经典米黄新闻纸，严肃深度报道 */
const fNytClassic: LayoutFn = p => `
.container { font-family: Georgia, 'Times New Roman', 'Songti SC', serif; }
h1 {
  font-size: 1.32em;
  margin: 2.2em auto 1.1em;
  padding-bottom: 0.4em;
  text-align: center;
  border-bottom: 3px double ${p.primary};
  font-family: Georgia, 'Times New Roman', 'Songti SC', serif;
  letter-spacing: 0.02em;
}
h2 { font-size: 1.16em; margin: 1.9em 0 0.95em; padding-bottom: 0.25em; border-bottom: 1px solid ${p.border}; }
h3 { font-size: 1.06em; margin: 1.6em 0 0.75em; font-style: italic; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; letter-spacing: 0.02em; }
p { letter-spacing: 0.02em; }
blockquote { border-left: 3px solid ${p.primary}; border-radius: 0; background: ${p.quoteBg}; font-style: italic; }
`.trim()

/** github-readme：README 即视感 */
const fGithubReadme: LayoutFn = p => `
h1 { font-size: 1.32em; margin: 1.9em 0 1em; padding-bottom: 0.35em; border-bottom: 1px solid ${p.border}; }
h2 { font-size: 1.18em; margin: 1.7em 0 0.9em; padding-bottom: 0.3em; border-bottom: 1px solid ${p.border}; }
h3 { font-size: 1.06em; margin: 1.5em 0 0.7em; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote { border-left: 4px solid ${p.border}; border-radius: 0; background: transparent; color: ${muted(p.text)}; }
.codespan { color: ${p.text}; background: ${p.quoteBg}; border: none; }
`.trim()

/** mint-fresh：清凉薄荷绿，生活方式与健康 */
const fMintFresh: LayoutFn = p => `
h1 { font-size: 1.28em; margin: 2em 0 1.05em; padding: 0.35em 0.85em; background: ${p.quoteBg}; color: ${p.primary}; border-radius: 20px; }
h2 { font-size: 1.16em; margin: 1.7em 0 0.95em; padding-left: 0.7em; border-left: 5px solid ${p.primary}; }
h3 { font-size: 1.06em; margin: 1.5em 0 0.7em; padding-bottom: 0.22em; border-bottom: 2px dashed ${rgba(p.primary, 0.4)}; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote { border-left: 4px solid ${p.primary}; border-radius: 14px; background: ${p.quoteBg}; }
`.trim()

/** sunset-amber：暖琥珀黄昏，散文游记 */
const fSunsetAmber: LayoutFn = p => `
h1 {
  font-size: 1.3em;
  margin: 2em 0 1.1em;
  padding: 0.4em 0.9em;
  color: #ffffff;
  border-radius: 6px;
  background: linear-gradient(120deg, ${p.primary}, ${p.quoteBorder});
}
h2 { font-size: 1.16em; margin: 1.7em 0 0.95em; padding-left: 0.7em; border-left: 4px solid ${p.primary}; background: linear-gradient(90deg, ${p.quoteBg}, transparent); }
h3 { font-size: 1.06em; margin: 1.5em 0 0.7em; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote { border-left: 4px solid ${p.primary}; border-radius: 0 8px 8px 0; background: ${p.quoteBg}; }
`.trim()

/** ink-minimal：黑白水墨，零色彩干扰 */
const fInkMinimal: LayoutFn = p => `
h1 { font-size: 1.3em; margin: 2.1em auto 1.1em; padding-bottom: 0.35em; text-align: center; border-bottom: 1px solid ${p.border}; letter-spacing: 0.2em; }
h2 { font-size: 1.16em; margin: 1.8em 0 0.95em; padding-left: 0.7em; border-left: 3px solid ${p.text}; color: ${p.text}; }
h3 { font-size: 1.06em; margin: 1.5em 0 0.7em; color: ${p.text}; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
p { letter-spacing: 0.08em; }
blockquote { border-left: 3px solid ${p.border}; border-radius: 0; background: transparent; color: ${muted(p.text)}; }
strong { color: ${p.text}; font-weight: bold; }
`.trim()

/** lavender-dream：梦幻紫，诗意与灵感 */
const fLavenderDream: LayoutFn = p => `
h1 { font-size: 1.28em; margin: 2em 0 1.05em; padding: 0.38em 0.9em; border-radius: 14px; background: linear-gradient(120deg, ${p.quoteBg}, ${rgba(p.primary, 0.16)}); color: ${p.primary}; }
h2 { font-size: 1.16em; margin: 1.7em 0 0.95em; padding-left: 0.7em; border-left: 4px solid ${p.primary}; background: linear-gradient(90deg, ${p.quoteBg}, transparent); }
h3 { font-size: 1.06em; margin: 1.5em 0 0.7em; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote { border-left: 4px solid ${p.primary}; border-radius: 12px; background: ${p.quoteBg}; }
`.trim()

/** coffee-house：巧克力棕，午后咖啡馆 */
const fCoffeeHouse: LayoutFn = p => `
h1 { font-size: 1.3em; margin: 2.1em auto 1.1em; padding: 0.42em 1.1em; text-align: center; background: ${p.primary}; color: #ffffff; border-radius: 3px; letter-spacing: 0.08em; }
h2 { font-size: 1.16em; margin: 1.8em 0 0.95em; padding-bottom: 0.28em; border-bottom: 2px solid ${rgba(p.primary, 0.4)}; }
h3 { font-size: 1.06em; margin: 1.5em 0 0.7em; padding-left: 0.6em; border-left: 3px solid ${p.primary}; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; letter-spacing: 0.04em; }
blockquote { border-left: 4px solid ${p.primary}; border-radius: 0; background: ${p.quoteBg}; }
`.trim()

/** bauhaus-primary：包豪斯三原色，现代主义先锋 */
const fBauhaus: LayoutFn = p => `
h1 {
  font-size: 1.3em;
  margin: 2em 0 1.1em;
  padding: 0.4em 0.9em;
  background: ${p.primary};
  color: #ffffff;
  border-left: 12px solid #ffd400;
  letter-spacing: 0.02em;
}
h2 {
  font-size: 1.16em;
  margin: 1.7em 0 0.95em;
  padding: 0.3em 0.75em;
  background: ${p.quoteBg};
  border-left: 8px solid ${p.primary};
  border-radius: 0;
}
h3 { font-size: 1.06em; margin: 1.5em 0 0.7em; padding-bottom: 0.24em; border-bottom: 3px solid ${p.primary}; }
h4, h5, h6 { font-size: 1em; margin: 1.2em 0 0.6em; color: ${p.text}; }
blockquote { border-left: 8px solid ${p.primary}; border-radius: 0; background: ${p.quoteBg}; }
`.trim()

/** 版式注册表：主题通过 layout 字段引用 */
export const LAYOUTS: Record<string, LayoutFn> = {
  minimal,
  focus,
  elegant,
  bold,
  'basic-default': basicDefault,
  'basic-bytedance': basicBytedance,
  'basic-apple': basicApple,
  'basic-sports': basicSports,
  'basic-chinese': basicChinese,
  'basic-cyber': basicCyber,
  'f-sspai-red': fSspaiRed,
  'f-wechat-native': fWechatNative,
  'f-nyt-classic': fNytClassic,
  'f-github-readme': fGithubReadme,
  'f-mint-fresh': fMintFresh,
  'f-sunset-amber': fSunsetAmber,
  'f-ink-minimal': fInkMinimal,
  'f-lavender-dream': fLavenderDream,
  'f-coffee-house': fCoffeeHouse,
  'f-bauhaus-primary': fBauhaus,
}
