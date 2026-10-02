/**
 * 命令行工具：Markdown -> 公众号可用 HTML，或直接推进草稿箱。
 *
 *   node dist/cli-convert.js article.md --theme bold-blue --font-size large > out.html
 *   cat article.md | node dist/cli-convert.js --theme focus-green
 *   node dist/cli-convert.js article.md --draft --title "标题" --cover https://.../a.png
 *   node dist/cli-convert.js --list-themes
 *   node dist/cli-convert.js --check-all
 *
 * 输出约定：stdout 只放**机器可读**结果（HTML / --json / mediaId），
 * 人类可读的摘要一律走 stderr，所以 `> out.html` 和 `MEDIA=$(...)` 都是干净的。
 *
 * 退出码：0 成功 / 1 运行失败（渲染、微信接口）/ 2 参数有误。
 */
import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { BACKGROUND_TYPES, convertMarkdown, FONT_SIZE_MAP, type ConvertOptions } from './renderer'
import { listThemes, THEMES } from './themes'
import { listCodeThemes } from './code-theme'
import { credentialsFromEnv, describeWeChatError, pushDraft } from './wechat'

/* ------------------------------------------------------------------ */
/* 参数解析                                                             */
/* ------------------------------------------------------------------ */

/** 每个选项的取值类型；没列在这里的一律当作拼错 */
const OPTIONS: Record<string, `flag` | `value`> = {
  help: `flag`,
  version: `flag`,
  'list-themes': `flag`,
  'list-code-themes': `flag`,
  'check-all': `flag`,
  json: `flag`,
  theme: `value`,
  'font-size': `value`,
  'background-type': `value`,
  'code-theme': `value`,
  draft: `flag`,
  title: `value`,
  author: `value`,
  digest: `value`,
  cover: `value`,
  'source-url': `value`,
  'app-id': `value`,
  'app-secret': `value`,
}

const ALIASES: Record<string, string> = { h: `help`, v: `version` }

interface Parsed {
  opts: Record<string, string | true>
  positional: string[]
  problems: string[]
}

function parseArgs(argv: string[]): Parsed {
  const opts: Record<string, string | true> = {}
  const positional: string[] = []
  const problems: string[] = []
  let literal = false

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]

    // `--` 之后一律当文件路径，`-` 表示 stdin
    if (literal || !raw.startsWith(`-`) || raw === `-`) {
      positional.push(raw)
      continue
    }
    if (raw === `--`) {
      literal = true
      continue
    }

    const body = raw.replace(/^-+/, ``)
    const eq = body.indexOf(`=`)
    const key = ALIASES[eq === -1 ? body : body.slice(0, eq)]
      ?? (eq === -1 ? body : body.slice(0, eq))
    const inlineValue = eq === -1 ? undefined : body.slice(eq + 1)

    const kind = OPTIONS[key]
    if (!kind) {
      const near = suggest(key, Object.keys(OPTIONS))
      problems.push(`未知选项 ${raw}${near.length ? `（是不是想用 ${near.map(n => `--${n}`).join(` / `)}？）` : ``}`)
      continue
    }

    if (kind === `flag`) {
      if (inlineValue !== undefined)
        problems.push(`选项 --${key} 是开关，不接受值（收到 "${inlineValue}"）`)
      opts[key] = true
      continue
    }

    if (inlineValue !== undefined) {
      opts[key] = inlineValue
      continue
    }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith(`--`)) {
      problems.push(`选项 --${key} 缺少值`)
      continue
    }
    opts[key] = argv[++i]
  }

  return { opts, positional, problems }
}

/* ------------------------------------------------------------------ */
/* 拼错建议                                                             */
/* ------------------------------------------------------------------ */

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = curr
  }
  return prev[b.length]
}

/** 从候选里挑出最像的几个，供「你是不是想用 X」提示 */
function suggest(value: string, candidates: string[], limit = 3): string[] {
  return candidates
    .map(name => ({ name, distance: editDistance(value.toLowerCase(), name.toLowerCase()) }))
    .filter(s => s.distance <= 3 || s.name.startsWith(value) || value.startsWith(s.name))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(s => s.name)
}

/** 校验取值，不合法就记进 problems（而不是静默回退） */
function checkChoice(
  option: string,
  value: string | true | undefined,
  candidates: readonly string[],
  problems: string[],
): void {
  if (value === undefined)
    return
  const text = String(value)
  if (candidates.includes(text))
    return
  const near = suggest(text, candidates)
  problems.push(
    `--${option} 的值 "${text}" 不认识`
    + (near.length ? `（是不是想用 ${near.join(` / `)}？）` : ``)
    + `\n  可用值：${candidates.slice(0, 12).join(` `)}${candidates.length > 12 ? ` …（共 ${candidates.length} 个）` : ``}`,
  )
}

/* ------------------------------------------------------------------ */
/* 帮助与出错                                                           */
/* ------------------------------------------------------------------ */

function usage(): string {
  const themeCount = THEMES.length
  const codeThemeCount = listCodeThemes().length
  return `Markdown -> 微信公众号排版（可输出 HTML，也可直接建草稿）

用法
  cli-convert [文件.md] [选项]        文件省略或写 - 时从 stdin 读取

转换
  cli-convert article.md --theme bold-blue --font-size large > out.html
  cat article.md | cli-convert --theme focus-green
  cli-convert article.md --json

推进公众号草稿箱（不需要常驻服务）
  cli-convert article.md --draft --title "我的文章" --cover https://example.com/cover.png

其他
  cli-convert --list-themes           列出全部 ${themeCount} 套主题
  cli-convert --list-code-themes      列出全部 ${codeThemeCount} 套代码配色
  cli-convert --check-all [文件.md]   回归自检：所有主题渲染一遍并校验产物

选项
  --theme <name>           主题名，默认 default
  --font-size <档位>       ${Object.keys(FONT_SIZE_MAP).join(` | `)}，默认 medium
  --background-type <类型> ${BACKGROUND_TYPES.join(` | `)}，默认 default
  --code-theme <name>      代码块配色，默认用主题自带的
  --json                   输出结构化 JSON 而不是 HTML

草稿推送（配合 --draft）
  --title <文字>           标题，必填
  --author <文字>          作者
  --digest <文字>          摘要，留空由微信自动截取
  --cover <图片URL>        封面图；留空则取正文第一张图（两者都没有会报错）
  --source-url <链接>      原文链接
  --app-id / --app-secret  公众号凭证；不传则读 WECHAT_APP_ID / WECHAT_APP_SECRET

  --help, -h               显示本帮助
  --version, -v            显示版本

输出约定
  stdout 只有机器可读结果（HTML / JSON / mediaId），摘要与报错走 stderr。
  退出码：0 成功 / 1 运行失败 / 2 参数有误。
`
}

function fail(message: string, code: number, showUsageHint = false): never {
  process.stderr.write(`${message}\n`)
  if (showUsageHint)
    process.stderr.write(`\n运行 cli-convert --help 查看用法。\n`)
  process.exit(code)
}

const toStr = (value: string | true | undefined): string | undefined =>
  typeof value === `string` ? value : undefined

/* ------------------------------------------------------------------ */
/* 主流程                                                               */
/* ------------------------------------------------------------------ */

const { opts, positional, problems } = parseArgs(process.argv.slice(2))

if (opts.help) {
  process.stdout.write(usage())
  process.exit(0)
}

if (opts.version) {
  let version = `unknown`
  try {
    const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../package.json`, import.meta.url)), `utf8`))
    version = pkg.version ?? version
  }
  catch {}
  process.stdout.write(`wechat-md-studio ${version}\n`)
  process.exit(0)
}

// 参数层面的问题一次全报出来，别让人改一个跑一次
if (problems.length)
  fail(problems.map(p => `✗ ${p}`).join(`\n`), 2, true)

if (opts[`list-themes`]) {
  for (const t of listThemes())
    console.log(`${t.name.padEnd(20)} ${t.series.padEnd(9)} ${t.description}`)
  process.exit(0)
}

if (opts[`list-code-themes`]) {
  for (const name of listCodeThemes())
    console.log(name)
  process.exit(0)
}

// 自检：单进程内把所有主题渲染一遍，检查产物是否合法
if (opts[`check-all`]) {
  const markdown = positional[0]
    ? fs.readFileSync(positional[0], `utf8`)
    : `# 标题\n\n正文 **加粗** 和 \`代码\`。\n\n\`\`\`js\nconsole.log(1)\n\`\`\`\n`
  const themes = listThemes()
  let failed = 0
  console.log(`${'主题'.padEnd(20)} ${'字节'.padStart(7)} ${'内联样式'.padStart(8)}  状态`)
  for (const t of themes) {
    try {
      const html = convertMarkdown({ markdown, theme: t.name }).html
      const inlineCount = (html.match(/style="/g) ?? []).length
      const issues: string[] = []
      if (!html.startsWith(`<section`))
        issues.push(`未以 section 开头`)
      if (inlineCount < 5)
        issues.push(`内联样式过少`)
      if (/var\(--/.test(html))
        issues.push(`残留 var()`)
      if (/calc\(/.test(html))
        issues.push(`残留 calc()`)
      if (/<style/i.test(html))
        issues.push(`残留 <style>`)
      if (/class=/.test(html))
        issues.push(`残留 class`)

      if (issues.length)
        failed++
      console.log(`${t.name.padEnd(20)} ${String(html.length).padStart(7)} ${String(inlineCount).padStart(8)}  ${issues.length ? `✗ ${issues.join(`, `)}` : `✓`}`)
    }
    catch (error) {
      failed++
      console.log(`${t.name.padEnd(20)} ${`-`.padStart(7)} ${`-`.padStart(8)}  ✗ 渲染异常: ${(error as Error).message}`)
    }
  }
  console.log(`\n共 ${themes.length} 个主题，失败 ${failed} 个`)
  process.exit(failed ? 1 : 0)
}

// 取值校验：主题/配色名拼错时给建议，而不是静默回退到默认
const themeNames = THEMES.map(t => t.name)
checkChoice(`theme`, opts.theme, themeNames, problems)
checkChoice(`font-size`, opts[`font-size`], Object.keys(FONT_SIZE_MAP), problems)
checkChoice(`background-type`, opts[`background-type`], BACKGROUND_TYPES, problems)
if (opts[`code-theme`])
  checkChoice(`code-theme`, opts[`code-theme`], listCodeThemes(), problems)
if (problems.length)
  fail(problems.map(p => `✗ ${p}`).join(`\n`), 2, true)

// 读取输入：既没给文件、stdin 又不是管道时别死等，直接说清楚
if (!positional[0] && process.stdin.isTTY) {
  fail(
    `✗ 没有指定 Markdown 文件，stdin 也不是管道。\n`
    + `  传文件：cli-convert article.md ...\n`
    + `  走管道：cat article.md | cli-convert ...`,
    2,
    true,
  )
}

let markdown: string
try {
  markdown = positional[0] && positional[0] !== `-`
    ? fs.readFileSync(positional[0], `utf8`)
    : fs.readFileSync(0, `utf8`)
}
catch (error) {
  fail(`✗ 读取 Markdown 失败：${(error as Error).message}`, 1)
}

if (!markdown.trim())
  fail(`✗ Markdown 内容为空，没有可转换的东西。`, 2)

const renderOptions: ConvertOptions = {
  markdown,
  theme: toStr(opts.theme),
  fontSize: toStr(opts[`font-size`]),
  backgroundType: toStr(opts[`background-type`]),
  codeTheme: toStr(opts[`code-theme`]),
}

/* ---------------------------- 推草稿 ------------------------------ */

if (opts.draft) {
  const title = toStr(opts.title)
  if (!title)
    fail(`✗ --draft 需要 --title（标题）。`, 2, true)

  const appId = toStr(opts[`app-id`])
  const appSecret = toStr(opts[`app-secret`])
  const cred = appId && appSecret ? { appId, appSecret } : credentialsFromEnv()
  if (!cred) {
    fail(
      `✗ 缺少公众号凭证：用 --app-id / --app-secret 传入，`
      + `或设置环境变量 WECHAT_APP_ID / WECHAT_APP_SECRET。`,
      2,
    )
  }

  try {
    const result = await pushDraft(cred, {
      title,
      markdown: renderOptions.markdown,
      author: toStr(opts.author),
      digest: toStr(opts.digest),
      contentSourceUrl: toStr(opts[`source-url`]),
      coverImageUrl: toStr(opts.cover),
      theme: renderOptions.theme,
      fontSize: renderOptions.fontSize,
      backgroundType: renderOptions.backgroundType,
      codeTheme: renderOptions.codeTheme,
    })

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    }
    else {
      process.stderr.write(
        `草稿已创建  主题=${result.theme} 字数=${result.wordCount} `
        + `正文图=${result.uploadedImages} 张\n`,
      )
      for (const bad of result.failedImages)
        process.stderr.write(`  ⚠ 图片没传上去（草稿里会是坏图）：${bad}\n`)
      process.stderr.write(`去公众号后台「草稿箱」查看。\n`)
      process.stdout.write(`${result.mediaId}\n`)
    }
  }
  catch (error) {
    fail(`✗ 推送失败：${describeWeChatError(error)}`, 1)
  }

  process.exit(0)
}

/* ---------------------------- 纯转换 ------------------------------ */

try {
  const result = convertMarkdown(renderOptions)

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }
  else {
    process.stderr.write(
      `主题=${result.theme} 字号=${result.fontSize} 背景=${result.backgroundType} `
      + `字数=${result.wordCount} 预计阅读=${result.estimatedReadTime}分钟\n`,
    )
    process.stdout.write(`${result.html}\n`)
  }
}
catch (error) {
  fail(`✗ 渲染失败：${(error as Error).message}`, 1)
}
