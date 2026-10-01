/**
 * juice 内联管线：把主题 CSS 落到每个元素的 style 属性上，产出微信公众号可用 HTML。
 *
 * 微信编辑器会剥掉 <style>/class/id，只认行内 style，且会丢弃 var()/calc()。
 * 所以顺序必须是：先展平变量 -> 再 juice 内联 -> 最后清掉残留声明。
 */
import { JSDOM } from 'jsdom'
import juice from 'juice'
import { processCSS, wrapCSSWithScope } from '@md/core/theme'
import { sanitizeHtmlCssForJuice, stripFontFamilyForJuiceFallback } from './juice-prep'

const JUICE_OPTIONS = {
  inlinePseudoElements: true,
  preserveImportant: true,
  resolveCSSVariables: false,
} as const

/** 把 li 内嵌的 ul/ol 提到 li 同级 —— 微信不支持嵌套列表，只能平铺 */
function flattenNestedLists(root: Element): void {
  root.querySelectorAll(`li > ul, li > ol`).forEach((node) => {
    node.parentElement?.insertAdjacentElement(`afterend`, node)
  })
}

/** width/height 是 HTML 属性，微信会忽略；搬到 style 上才生效 */
function moveImageSizeToStyle(root: Element): void {
  root.querySelectorAll(`img`).forEach((image) => {
    const additions: string[] = []

    const width = image.getAttribute(`width`)
    if (width) {
      image.removeAttribute(`width`)
      additions.push(`width:${/^\d+$/.test(width) ? `${width}px` : width}`)
    }

    const height = image.getAttribute(`height`)
    if (height) {
      image.removeAttribute(`height`)
      additions.push(`height:${/^\d+$/.test(height) ? `${height}px` : height}`)
    }

    if (!additions.length)
      return

    const existing = (image.getAttribute(`style`) ?? ``).replace(/;+\s*$/, ``)
    image.setAttribute(`style`, existing ? `${existing};${additions.join(`;`)}` : additions.join(`;`))
  })
}

/**
 * 样式已经全部内联，class 和编辑器专用的 data 属性对微信毫无意义，
 * 去掉能让产物更小、也更不容易和公众号自带的样式撞车。
 */
function stripEditorArtifacts(root: Element): void {
  root.querySelectorAll(`[class]`).forEach(el => el.removeAttribute(`class`))
  root.querySelectorAll(`[data-heading]`).forEach(el => el.removeAttribute(`data-heading`))
}

/** 清掉内联后残留的变量声明与引用（微信不认，留着也是脏数据） */
function stripResidualVariables(html: string, variables: Record<string, string>): string {
  let out = html
  for (const [name, value] of Object.entries(variables)) {
    if (value)
      out = out.split(`var(${name})`).join(value)
  }
  // 未解析到的变量直接删掉声明，避免 style 里出现非法片段
  return out.replace(/--md-[\w-]+\s*:\s*[^;"]*;?/g, ``)
}

export interface InlineInput {
  /** 未加 scope 的完整主题 CSS */
  themeCSS: string
  /** createContainer 产出的 <section class="container">...</section> */
  containerHtml: string
  /** 展平后可能仍有残留的变量，用于兜底替换 */
  variables: Record<string, string>
}

export function inlineForWeChat({ themeCSS, containerHtml, variables }: InlineInput): string {
  // 1. 主题 CSS 限定到 #output 作用域，再展平 var()/calc()
  const scoped = wrapCSSWithScope(themeCSS, `#output`)
  const flattened = processCSS(scoped)

  // 2. 组成完整文档：juice 需要真实文档结构才能匹配 #output
  const document = `<!doctype html><html><head><meta charset="utf-8"><style>${flattened}</style></head><body><div id="output">${containerHtml}</div></body></html>`

  // 3. juice 内联（带两级降级，和 doocs/md 一致）
  const sanitized = sanitizeHtmlCssForJuice(document)
  const attempts = [
    () => juice(sanitized, JUICE_OPTIONS),
    () => juice(sanitized, { ...JUICE_OPTIONS, inlinePseudoElements: false }),
    () => juice(stripFontFamilyForJuiceFallback(sanitized), { ...JUICE_OPTIONS, inlinePseudoElements: false }),
  ]
  let inlined = sanitized
  for (const attempt of attempts) {
    try {
      inlined = attempt()
      break
    }
    catch (error) {
      console.warn(`[inline] juice 失败，尝试降级方案:`, (error as Error).message)
    }
  }

  // 4. 取回 #output 内容并做结构后处理
  const dom = new JSDOM(inlined)
  const output = dom.window.document.getElementById(`output`)
  if (!output)
    throw new Error(`渲染结果中未找到 #output 容器`)

  flattenNestedLists(output)
  moveImageSizeToStyle(output)
  stripEditorArtifacts(output)

  return stripResidualVariables(output.innerHTML, variables).trim()
}
