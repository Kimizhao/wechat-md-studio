/** 主题数据结构定义 */

export interface ThemePalette {
  /** 主强调色：标题、加粗、边框、行内代码 */
  primary: string
  /** 正文色 */
  text: string
  /** 页面底色 */
  background: string
  /** 引用块底色 */
  quoteBg: string
  /** 引用块左边框色（通常比 primary 更重） */
  quoteBorder: string
  /** 表格线 / 分割线 */
  border: string
  /** 链接色 */
  link: string
}

/** 四种批量主题（Minimal / Focus / Elegant / Bold）共用的版式族 */
export type SeriesKey = 'minimal' | 'focus' | 'elegant' | 'bold'

export interface ThemeDefinition {
  /** 唯一 id，对齐 md2wechat 的主题名 */
  name: string
  /** 中文显示名 */
  label: string
  /** 分组：basic / minimal / focus / elegant / bold / featured */
  series: string
  description: string
  palette: ThemePalette
  /** 版式名，对应 layouts.ts 里 LAYOUTS 注册表的 key */
  layout: string
  /** 代码块配色（highlight.js 样式名）；不填用全局默认 */
  codeTheme?: string
  /** 主题专属追加 CSS（在基础版式之后写入） */
  extra?: string
}
