/**
 * 编辑器模块（浏览器侧）。
 *
 * 把 CodeMirror 6 组装成一个「行号 + Markdown 语法高亮」的编辑器，
 * 并把菜单栏需要的排版命令统一注册成一张命令表，供页面按名字调用。
 *
 * 构建成 IIFE 后对外只暴露 `window.MDEditor`。
 */
import { EditorSelection, EditorState } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
  rectangularSelection,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  selectAll,
  undo,
} from '@codemirror/commands'
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { tags as t } from '@lezer/highlight'

const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

/* ------------------------------------------------------------------ *
 * 语法高亮配色
 * tag 取自 @lezer/markdown 的 styleTags 映射，覆盖 Markdown 全部节点。
 * ------------------------------------------------------------------ */
const markdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: `1.5em`, fontWeight: `700`, color: `#12161c` },
  { tag: t.heading2, fontSize: `1.3em`, fontWeight: `700`, color: `#12161c` },
  { tag: t.heading3, fontSize: `1.15em`, fontWeight: `700`, color: `#12161c` },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: `700`, color: `#12161c` },
  { tag: t.strong, fontWeight: `700`, color: `#12161c` },
  { tag: t.emphasis, fontStyle: `italic`, color: `#2a3040` },
  { tag: t.strikethrough, textDecoration: `line-through`, opacity: `0.7` },
  { tag: t.link, color: `#3b6ef6` },
  { tag: t.url, color: `#7b8798`, textDecoration: `underline` },
  { tag: t.monospace, fontFamily: MONO, backgroundColor: `#f1f3f7`, color: `#c0392b`, borderRadius: `3px` },
  { tag: t.quote, color: `#5b6576`, fontStyle: `italic` },
  { tag: t.list, color: `#2a3040` },
  { tag: t.contentSeparator, color: `#b6bec9`, fontWeight: `700` },
  { tag: t.processingInstruction, color: `#a8b0bd` },
  { tag: t.labelName, color: `#7b8798` },
  { tag: t.string, color: `#0a7d55` },
  { tag: t.comment, color: `#98a2b3`, fontStyle: `italic` },
  { tag: [t.escape, t.character], color: `#7b8798` },
  { tag: t.content, color: `#1f2329` },
])

/* ------------------------------------------------------------------ *
 * 编辑器外观
 * ------------------------------------------------------------------ */
const editorTheme = EditorView.theme({
  '&': { height: `100%`, fontSize: `13.5px`, backgroundColor: `#ffffff`, color: `#1f2329` },
  '&.cm-focused': { outline: `none` },
  '.cm-scroller': { fontFamily: MONO, lineHeight: `1.85`, overflow: `auto` },
  '.cm-content': { padding: `16px 0 40px`, caretColor: `#3b6ef6` },
  '.cm-gutters': {
    backgroundColor: `#fafbfd`,
    color: `#aab2bf`,
    border: `none`,
    borderRight: `1px solid #eef1f5`,
    userSelect: `none`,
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: `0 10px 0 14px`, minWidth: `32px` },
  '.cm-foldGutter .cm-gutterElement': { padding: `0 2px 0 0`, color: `#c3cad4` },
  '.cm-activeLine': { backgroundColor: `#f5f8fd` },
  '.cm-activeLineGutter': { backgroundColor: `#eaf0fb`, color: `#3b6ef6` },
  '.cm-selectionBackground, ::selection': { backgroundColor: `#d7e2ff !important` },
  '.cm-cursor, .cm-dropCursor': { borderLeftWidth: `2px`, borderLeftColor: `#3b6ef6` },
  '.cm-matchingBracket, .cm-nonmatchingBracket': { backgroundColor: `#dde7ff`, outline: `none` },
  '.cm-searchMatch': { backgroundColor: `#fff2a8` },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: `#ffd166` },
  '.cm-panels': { backgroundColor: `#fafbfd`, border: `none`, borderTop: `1px solid #e6e9ee` },
  '.cm-panel.cm-search': { padding: `8px 12px`, fontFamily: `inherit`, fontSize: `12.5px` },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': {
    fontFamily: `inherit`,
    fontSize: `12.5px`,
  },
  '.cm-panel.cm-search input': {
    padding: `3px 7px`,
    border: `1px solid #e3e6ea`,
    borderRadius: `5px`,
    outline: `none`,
  },
  '.cm-placeholder': { color: `#b0b8c4` },
}, { dark: false })

/* ------------------------------------------------------------------ *
 * 行级标记：标题 / 引用 / 列表
 * ------------------------------------------------------------------ */
/** 行首已有的块级标记（含缩进，缩进留在第 1 组） */
const LEADING_MARK = /^(\s*)(?:[-*+][ \t]+\[[ xX]\][ \t]+|#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+\.[ \t]+)?/

/** 取出行首标记本身（不含缩进） */
function markerOf(text) {
  const matched = text.match(LEADING_MARK)
  return matched ? matched[0].slice(matched[1].length) : ``
}

/** 选区覆盖到的所有行号，去重升序 */
function selectedLines(state) {
  const numbers = new Set()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n += 1) numbers.add(n)
  }
  return [...numbers].sort((a, b) => a - b)
}

/**
 * 逐行替换行首标记。
 * @param {(index: number, text: string) => string} markFor 返回新标记，空串表示去掉标记
 */
function applyLineMark(markFor) {
  return (view) => {
    const { state } = view
    const changes = selectedLines(state).map((number, index) => {
      const line = state.doc.line(number)
      const bare = line.text.replace(LEADING_MARK, (_, indent) => indent)
      const indent = line.text.slice(0, line.text.length - bare.length)
      return { from: line.from, to: line.to, insert: indent + markFor(index, line.text) + bare.slice(indent.length) }
    })
    view.dispatch({ changes })
    view.focus()
    return true
  }
}

/* ------------------------------------------------------------------ *
 * 行内标记：加粗 / 斜体 / 删除线 / 行内代码
 * ------------------------------------------------------------------ */
/** 用成对标记包住选区；无选区时插入占位文字并选中它 */
function wrapSelection(before, after, placeholder) {
  return (view) => {
    view.dispatch(view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to) || placeholder
      const start = range.from + before.length
      return {
        changes: { from: range.from, to: range.to, insert: before + text + after },
        range: EditorSelection.range(start, start + text.length),
      }
    }))
    view.focus()
    return true
  }
}

function insertSnippet(snippet, cursorOffset) {
  return (view) => {
    const range = view.state.selection.main
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: snippet },
      selection: EditorSelection.cursor(range.from + (cursorOffset ?? snippet.length)),
    })
    view.focus()
    return true
  }
}

/* ------------------------------------------------------------------ *
 * 命令表
 * ------------------------------------------------------------------ */
const TABLE_SNIPPET = `\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n`

const commands = {
  /* 编辑 */
  undo,
  redo,
  selectAll,
  find: openSearchPanel,

  /* 行内 */
  bold: wrapSelection(`**`, `**`, `粗体`),
  italic: wrapSelection(`*`, `*`, `斜体`),
  strike: wrapSelection(`~~`, `~~`, `删除线`),
  code: wrapSelection('`', '`', `行内代码`),

  link: (view) => {
    const range = view.state.selection.main
    const text = view.state.sliceDoc(range.from, range.to)
    const insert = /^https?:\/\//i.test(text)
      ? `[链接文字](${text})`
      : `[${text || `链接文字`}](https://)`
    view.dispatch({ changes: { from: range.from, to: range.to, insert } })
    view.focus()
    return true
  },
  image: wrapSelection(`![`, `](https://)`, `图片描述`),

  /* 块级 */
  h1: applyLineMark((_, text) => (markerOf(text) === `# ` ? `` : `# `)),
  h2: applyLineMark((_, text) => (markerOf(text) === `## ` ? `` : `## `)),
  h3: applyLineMark((_, text) => (markerOf(text) === `### ` ? `` : `### `)),
  h4: applyLineMark((_, text) => (markerOf(text) === `#### ` ? `` : `#### `)),
  h5: applyLineMark((_, text) => (markerOf(text) === `##### ` ? `` : `##### `)),
  h6: applyLineMark((_, text) => (markerOf(text) === `###### ` ? `` : `###### `)),
  quote: applyLineMark((_, text) => (markerOf(text) === `> ` ? `` : `> `)),
  bullet: applyLineMark((_, text) => (markerOf(text) === `- ` ? `` : `- `)),
  task: applyLineMark((_, text) => (markerOf(text) === `- [ ] ` ? `` : `- [ ] `)),
  ordered: applyLineMark((index, text) => (/^\d+\.\s$/.test(markerOf(text)) ? `` : `${index + 1}. `)),

  /* 插入 */
  hr: insertSnippet(`\n\n---\n\n`),
  table: insertSnippet(TABLE_SNIPPET, 2),
  codeblock: (view) => {
    const range = view.state.selection.main
    const body = view.state.sliceDoc(range.from, range.to)
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: '```\n' + body + '\n```' },
      selection: EditorSelection.range(range.from + 4, range.from + 4 + body.length),
    })
    view.focus()
    return true
  },

  clear: (view) => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: `` } })
    view.focus()
    return true
  },
}

/* ------------------------------------------------------------------ *
 * 快捷键
 * ------------------------------------------------------------------ */
const headingKeys = [1, 2, 3, 4, 5, 6].flatMap(level => ([
  // macOS 与 Chrome 会吞掉 ⌘1~⌘9（切标签页），所以再绑一份 ⌥⌘数字 保证可用
  { key: `Mod-${level}`, run: commands[`h${level}`] },
  { key: `Mod-Alt-${level}`, run: commands[`h${level}`] },
]))

const formatKeymap = [
  { key: `Mod-b`, run: commands.bold },
  { key: `Mod-i`, run: commands.italic },
  { key: `Mod-d`, run: commands.strike },
  { key: `Mod-e`, run: commands.code },
  { key: `Mod-k`, run: commands.link },
  { key: `Mod-Alt-c`, run: commands.codeblock },
  { key: `Mod-Alt-q`, run: commands.quote },
  { key: `Mod-Alt-u`, run: commands.bullet },
  { key: `Mod-Alt-o`, run: commands.ordered },
  ...headingKeys,
]

/* ------------------------------------------------------------------ *
 * 挂载
 * ------------------------------------------------------------------ */
function cursorInfo(state) {
  const range = state.selection.main
  const line = state.doc.lineAt(range.head)
  return {
    line: line.number,
    column: range.head - line.from + 1,
    selected: Math.abs(range.to - range.from),
  }
}

function mount({ parent, doc = ``, onChange, onCursor }) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        search({ top: true }),
        highlightSelectionMatches(),
        rectangularSelection(),
        crosshairCursor(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(markdownHighlight),
        EditorView.lineWrapping,
        placeholderExtension(`在这里写 Markdown，右侧实时预览微信公众号效果…`),
        editorTheme,
        keymap.of([
          ...formatKeymap,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange)
            onChange(update.state.doc.toString())
          if ((update.docChanged || update.selectionSet) && onCursor)
            onCursor(cursorInfo(update.state))
        }),
      ],
    }),
  })

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
    focus: () => view.focus(),
    cursor: () => cursorInfo(view.state),
    exec: (name, arg) => {
      const command = commands[name]
      if (!command) return false
      if (arg !== undefined) return command(view, arg)
      return command(view)
    },
  }
}

window.MDEditor = { mount, commands }
