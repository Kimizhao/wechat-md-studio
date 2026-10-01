/**
 * 代码高亮配色。
 *
 * highlight.js 自带 164 个样式表，直接从本地包读取即可，
 * 不依赖 CDN（doocs/md 是运行时从 OSS 拉的，服务端渲染不能这么干）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let stylesDir: string | null = null

function getStylesDir(): string {
  if (stylesDir)
    return stylesDir
  const pkgPath = require.resolve(`highlight.js/package.json`)
  stylesDir = path.join(path.dirname(pkgPath), `styles`)
  return stylesDir
}

/** 默认配色：浅色正文用 github，深色主题由主题自己指定 */
export const DEFAULT_CODE_THEME = `github`

export function listCodeThemes(): string[] {
  try {
    return fs.readdirSync(getStylesDir())
      .filter(f => f.endsWith(`.min.css`))
      .map(f => f.replace(`.min.css`, ``))
      .sort()
  }
  catch {
    return []
  }
}

/** 读取指定代码主题的 CSS；名字非法时回退到默认，仍失败则返回空串 */
export function loadCodeThemeCSS(name?: string): string {
  const target = name && /^[\w-]+$/.test(name) ? name : DEFAULT_CODE_THEME
  const dir = getStylesDir()
  for (const candidate of [`${target}.min.css`, `${target}.css`]) {
    const file = path.join(dir, candidate)
    if (fs.existsSync(file))
      return fs.readFileSync(file, `utf8`)
  }
  if (target !== DEFAULT_CODE_THEME)
    return loadCodeThemeCSS(DEFAULT_CODE_THEME)
  return ``
}
