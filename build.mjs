/**
 * 构建脚本。
 *
 * 两条产物链路：
 *  A. Node 侧（server / cli）—— 把 vendor/ 下的 @md/core + @md/shared 源码打进 bundle。
 *     vendor 里有 Vite 专有的 `?raw` 导入，以及 `@md/shared/xxx` 这种裸包名需要重映射，
 *     所以用两个自定义插件处理；node_modules 一律保持 external 交给运行时解析。
 *  B. 浏览器侧（编辑器）—— CodeMirror 等前端依赖必须打包进单文件 IIFE。
 */
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

/** 裸包名 -> vendor 目录 */
const VENDOR_PREFIX = {
  '@md/core': path.join(ROOT, 'vendor/core'),
  '@md/shared': path.join(ROOT, 'vendor/shared'),
}

/** 依次尝试：原路径 / +.ts / index.ts / +.json */
function resolveVendorFile(base) {
  const candidates = [base, `${base}.ts`, path.join(base, 'index.ts'), `${base}.json`]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate
  }
  throw new Error(`[vendor] 找不到模块: ${base}`)
}

/** 处理 `import x from './a.css?raw'` —— Vite 专有语法，这里降级成字符串导出 */
const rawPlugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => {
      const clean = args.path.replace(/\?raw$/, ``)
      const absolute = path.isAbsolute(clean) ? clean : path.resolve(args.resolveDir, clean)
      return { path: absolute, namespace: 'raw' }
    })
    b.onLoad({ filter: /.*/, namespace: 'raw' }, args => ({
      contents: `export default ${JSON.stringify(fs.readFileSync(args.path, `utf8`))}`,
      loader: `js`,
    }))
  },
}

/** 把 `@md/shared/types` 这类裸包名映射到 vendor 目录 */
const vendorPlugin = {
  name: 'vendor-alias',
  setup(b) {
    b.onResolve({ filter: /^@md\/(core|shared)(\/.*)?$/ }, (args) => {
      const match = args.path.match(/^(@md\/(?:core|shared))(\/.*)?$/)
      const [, pkgName, sub = ``] = match
      const base = path.join(VENDOR_PREFIX[pkgName], sub.replace(/^\//, ``))
      return { path: resolveVendorFile(base) }
    })
  },
}

const targets = [
  {
    label: `服务端`,
    entry: `src/server.ts`,
    out: `dist/server.js`,
    platform: `node`,
    format: `esm`,
    external: true,
  },
  {
    label: `命令行`,
    entry: `src/cli-convert.ts`,
    out: `dist/cli-convert.js`,
    platform: `node`,
    format: `esm`,
    external: true,
  },
  {
    label: `编辑器`,
    entry: `src/editor/main.js`,
    out: `public/static/editor.js`,
    platform: `browser`,
    format: `iife`,
    external: false,
    minify: true,
  },
]

for (const target of targets) {
  await build({
    entryPoints: [path.join(ROOT, target.entry)],
    outfile: path.join(ROOT, target.out),
    bundle: true,
    platform: target.platform,
    target: target.platform === `node` ? `node22` : [`chrome110`, `safari16`],
    format: target.format,
    sourcemap: true,
    logLevel: `warning`,
    minify: Boolean(target.minify),
    // node 侧把依赖留到运行时；浏览器侧必须全部打进去
    packages: target.external ? `external` : undefined,
    plugins: target.external ? [rawPlugin, vendorPlugin] : [],
    banner: target.platform === `node`
      ? { js: `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);` }
      : undefined,
  })
  const size = fs.statSync(path.join(ROOT, target.out)).size
  console.log(`✓ ${target.label.padEnd(6)} ${target.entry} -> ${target.out}  (${(size / 1024).toFixed(0)} KB)`)
}
