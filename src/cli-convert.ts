/**
 * 命令行转换工具（也用于自测）。
 *
 *   node dist/cli-convert.js article.md --theme bold-blue --font-size large
 *   cat article.md | node dist/cli-convert.js --theme focus-green
 */
import fs from 'node:fs'
import process from 'node:process'
import { convertMarkdown } from './renderer'
import { listThemes } from './themes'

function parseArgs(argv: string[]) {
  const opts: Record<string, string> = {}
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith(`--`)) {
      const key = arg.slice(2)
      const value = argv[i + 1] && !argv[i + 1].startsWith(`--`) ? argv[++i] : `true`
      opts[key] = value
    }
    else {
      positional.push(arg)
    }
  }
  return { opts, positional }
}

const { opts, positional } = parseArgs(process.argv.slice(2))

if (opts[`list-themes`]) {
  for (const t of listThemes())
    console.log(`${t.name.padEnd(20)} ${t.series.padEnd(9)} ${t.description}`)
  process.exit(0)
}

// 自检：单进程内把所有主题渲染一遍，检查产物是否合法
if (opts[`check-all`]) {
  const markdown = positional[0] ? fs.readFileSync(positional[0], `utf8`) : `# 标题\n\n正文 **加粗** 和 \`代码\`。\n\n\`\`\`js\nconsole.log(1)\n\`\`\`\n`
  const themes = listThemes()
  let failed = 0
  console.log(`${'主题'.padEnd(20)} ${'字节'.padStart(7)} ${'内联样式'.padStart(8)}  状态`)
  for (const t of themes) {
    try {
      const html = convertMarkdown({ markdown, theme: t.name }).html
      const inlineCount = (html.match(/style="/g) ?? []).length
      const problems: string[] = []
      if (!html.startsWith(`<section`))
        problems.push(`未以 section 开头`)
      if (inlineCount < 5)
        problems.push(`内联样式过少`)
      if (/var\(--/.test(html))
        problems.push(`残留 var()`)
      if (/calc\(/.test(html))
        problems.push(`残留 calc()`)
      if (/<style/i.test(html))
        problems.push(`残留 <style>`)
      if (/class=/.test(html))
        problems.push(`残留 class`)

      if (problems.length)
        failed++
      console.log(`${t.name.padEnd(20)} ${String(html.length).padStart(7)} ${String(inlineCount).padStart(8)}  ${problems.length ? `✗ ${problems.join(`, `)}` : `✓`}`)
    }
    catch (error) {
      failed++
      console.log(`${t.name.padEnd(20)} ${`-`.padStart(7)} ${`-`.padStart(8)}  ✗ 渲染异常: ${(error as Error).message}`)
    }
  }
  console.log(`\n共 ${themes.length} 个主题，失败 ${failed} 个`)
  process.exit(failed ? 1 : 0)
}

const markdown = positional[0]
  ? fs.readFileSync(positional[0], `utf8`)
  : fs.readFileSync(0, `utf8`)

const result = convertMarkdown({
  markdown,
  theme: opts.theme,
  fontSize: opts[`font-size`],
  backgroundType: opts[`background-type`],
  codeTheme: opts[`code-theme`],
})

if (opts.json) {
  console.log(JSON.stringify(result, null, 2))
}
else {
  process.stderr.write(
    `主题=${result.theme} 字号=${result.fontSize} 背景=${result.backgroundType} `
    + `字数=${result.wordCount} 预计阅读=${result.estimatedReadTime}分钟\n`,
  )
  console.log(result.html)
}
