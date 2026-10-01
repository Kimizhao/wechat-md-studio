/**
 * juice 前置清洗：丢弃/修正 juice(PostCSS) 解析不了的 CSS 片段。
 *
 * 移植自 doocs/md 的 apps/web/src/services/export/clipboard-dom.ts（WTFPL 许可），
 * 只保留纯字符串函数（去掉了依赖浏览器 DOM 的部分）。
 * 典型问题：Mermaid 会往边上写 `style="undefined;"`，C4/时序图会写不带引号的
 * `Open Sans`，PostCSS 会以 `Unknown word Open` 直接抛错。
 */

const GENERIC_FONT_FAMILIES = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|inherit|initial|unset|revert|revert-layer)$/i

function isUndefinedCssValue(value: string): boolean {
  const normalized = value.replace(/\s*!important$/i, ``).trim()
  return !normalized || /^undefined$/i.test(normalized) || /\bundefined\b/i.test(normalized)
}

function mapFontFamilyName(family: string): string {
  const unquoted = family.replace(/["']/g, ``).trim()
  if (!unquoted)
    return family
  if (/^var\(/i.test(family))
    return family
  if (GENERIC_FONT_FAMILIES.test(unquoted))
    return unquoted
  // 多词 / 中文名要加引号，否则 juice 的 CSS 解析器会断裂
  if (/\s/.test(unquoted) || unquoted.split(``).some(ch => ch.charCodeAt(0) > 127))
    return `'${unquoted}'`
  return unquoted
}

function quoteFontFamilyList(value: string): string {
  return value
    .split(/,(?=(?:[^'"]|'[^']*'|"[^"]*")*$)/)
    .map(part => mapFontFamilyName(part.trim()))
    .filter(Boolean)
    .join(`, `)
}

function quoteUnquotedFontFamilies(css: string): string {
  return css
    .replace(/font-family\s*:\s*([^;}{]+)/gi, (_, value: string) => `font-family: ${quoteFontFamilyList(value)}`)
    .replace(/(?<!['"])\bOpen Sans\b(?!['"])/gi, `sans-serif`)
}

function decodeStyleAttr(value: string): string {
  return value
    .replace(/&quot;/g, `"`)
    .replace(/&#34;/g, `"`)
    .replace(/&apos;|&#39;/g, `'`)
    .replace(/&amp;/g, `&`)
}

function encodeStyleAttr(value: string, quote: string): string {
  let next = value.replace(/&/g, `&amp;`)
  if (quote === `"`)
    next = next.replace(/"/g, `&quot;`)
  else
    next = next.replace(/'/g, `&#39;`)
  return next
}

function sanitizeCssDeclarations(css: string): string {
  const cleaned = css
    .split(`;`)
    .map(part => part.trim())
    .filter((part) => {
      if (!part || /^undefined$/i.test(part))
        return false
      const colon = part.indexOf(`:`)
      if (colon === -1)
        return false
      return !isUndefinedCssValue(part.slice(colon + 1))
    })
    .join(`; `)
  return quoteUnquotedFontFamilies(cleaned)
}

function sanitizeEmbeddedStylesheet(css: string): string {
  return quoteUnquotedFontFamilies(
    css.replace(/([a-z_-]+)\s*:\s*undefined\b\s*;?/gi, ``),
  )
}

/** 按 juice 的解析能力清洗整段 HTML（style 属性 + <style> 内容 + font-family 属性） */
export function sanitizeHtmlCssForJuice(html: string): string {
  const withStyleAttrs = html.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_full, quote: string, value: string) => {
    const sanitized = sanitizeCssDeclarations(decodeStyleAttr(value))
    return ` style=${quote}${encodeStyleAttr(sanitized, quote)}${quote}`
  })

  const withSheets = withStyleAttrs.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_full, open: string, css: string, close: string) => {
    return `${open}${sanitizeEmbeddedStylesheet(css)}${close}`
  })

  const withFontAttrs = withSheets.replace(/\sfont-family\s*=\s*(["'])([\s\S]*?)\1/gi, (_full, quote: string, value: string) => {
    return ` font-family=${quote}${encodeStyleAttr(quoteFontFamilyList(decodeStyleAttr(value)), quote)}${quote}`
  })

  return withFontAttrs.replace(/(?<!['"])\bOpen Sans\b(?!['"])/gi, `sans-serif`)
}

/** juice 连续失败时的兜底：整体剥掉 font-family 再试一次 */
export function stripFontFamilyForJuiceFallback(html: string): string {
  return html
    .replace(/font-family\s*:[^;}{]+;?/gi, ``)
    .replace(/\sfont-family\s*=\s*(["'])[\s\S]*?\1/gi, ``)
    .replace(/(?<!['"])\bOpen Sans\b(?!['"])/gi, `sans-serif`)
}
