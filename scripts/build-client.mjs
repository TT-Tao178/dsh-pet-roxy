// ============================================================================
// dsh-pet-roxy —— client 半侧构建脚本
//
// 把 src/client/index.tsx 打成 dsh client 契约要求的产物形状：
//
//   window.__ModuleLoader__.load({ id: "dsh-pet-roxy", factory: (require) => {
//   var module = { exports: {} }; var exports = module.exports;
//     ...打包后的模块代码（ESM 的 export 变成 exports.xxx）...
//   return module.exports; } });
//
// 说明：
//   - 本插件暂时不用任何平台模块（@deepseek-ai/*），所以没有 external，
//     React / ReactDOM 直接内联进产物（跨插件共享平台模块是被禁止的）。
//   - factory 的 require 由 loader 注入；真出现未内联的标识符就说明配置错了，
//     自检里的 require 桩会直接抛错。
//   - 产物路径必须是 lib/client.js：package.json 的 exports["./client"] 指向它，
//     dsh-client-modules 会校验 exports 并在缺失时对整个前端报 FAILED fiber。
//
// 用法：npm run build
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ID = 'dsh-pet-roxy'
const ENTRY = path.join(ROOT, 'src', 'client', 'index.tsx')
const OUTFILE = path.join(ROOT, 'lib', 'client.js')

// 产物体积 vs 可排查性：默认压缩。需要排查线上问题时用
// `node scripts/build-client.mjs --no-minify` 重新构建一份可读产物。
const MINIFY = !process.argv.includes('--no-minify')

if (!fs.existsSync(ENTRY)) {
  console.error(`[build-client] 找不到入口：${ENTRY}`)
  process.exit(1)
}
fs.mkdirSync(path.dirname(OUTFILE), { recursive: true })

const BANNER = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
].join('\n')

const FOOTER = 'return module.exports; } });'

await build({
  entryPoints: [ENTRY],
  outfile: OUTFILE,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  minify: MINIFY,
  legalComments: 'none',
  sourcemap: false,
  banner: { js: BANNER },
  footer: { js: FOOTER },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
})

// ---------------------------------------------------------------------------
// 自检：产物必须真的能在浏览器式环境里注册出 inject/apply
// ---------------------------------------------------------------------------
const code = fs.readFileSync(OUTFILE, 'utf8')
const problems = []

function fail(msg) { problems.push(msg) }

// 1) 包装形状
if (!code.trimStart().startsWith('window.__ModuleLoader__.load(')) {
  fail('产物开头不是 window.__ModuleLoader__.load(...) 包装')
}
if (!code.trimEnd().endsWith('return module.exports; } });')) {
  fail('产物结尾不是 return module.exports; } });')
}

// 2) 真跑一遍：造一个最小浏览器外壳，捕获 load()，再调用 factory
const noop = () => {}
const makeEl = () => ({
  style: {}, dataset: {}, id: '', textContent: '',
  setAttribute: noop, removeAttribute: noop, appendChild: noop,
  removeChild: noop, remove: noop, addEventListener: noop, removeEventListener: noop,
})
const fakeDocument = {
  createElement: makeEl,
  createElementNS: makeEl,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  head: makeEl(),
  body: makeEl(),
  documentElement: makeEl(),
  addEventListener: noop,
  removeEventListener: noop,
}
const fakeWindow = {
  document: fakeDocument,
  addEventListener: noop,
  removeEventListener: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
  setTimeout: () => 0,
  clearTimeout: noop,
  setInterval: () => 0,
  clearInterval: noop,
  navigator: { userAgent: 'node-dsh-build-selfcheck' },
}
fakeWindow.window = fakeWindow
fakeWindow.self = fakeWindow

let captured = null
fakeWindow.__ModuleLoader__ = {
  load(def) { captured = def },
}

try {
  // eslint-disable-next-line no-new-func
  const runner = new Function('window', 'document', 'self', 'navigator', code)
  runner(fakeWindow, fakeDocument, fakeWindow, fakeWindow.navigator)
} catch (err) {
  fail(`产物执行抛错：${err && err.message}`)
}

if (captured === null) {
  fail('产物没有调用 window.__ModuleLoader__.load(...)')
} else {
  if (captured.id !== ID) fail(`load() 的 id 应为 ${ID}，实际 ${String(captured.id)}`)
  if (typeof captured.factory !== 'function') {
    fail('load() 没有提供 factory 函数')
  } else {
    try {
      const mod = captured.factory((name) => {
        throw new Error(`未内联的平台模块被 require：${name}（说明 external 配置错了）`)
      })
      if (!Array.isArray(mod.inject)) fail('factory 返回值缺少 inject 数组')
      if (typeof mod.apply !== 'function') fail('factory 返回值缺少 apply 函数')
    } catch (err) {
      fail(`factory 执行抛错：${err && err.message}`)
    }
  }
}

const sizeKb = (fs.statSync(OUTFILE).size / 1024).toFixed(0)
if (problems.length > 0) {
  console.error(`[build-client] 自检失败（产物 ${sizeKb} KB）：`)
  for (const p of problems) console.error('  ✘ ' + p)
  process.exit(1)
}

console.log(`[build-client] OK  id=${ID}  minify=${MINIFY}  ${sizeKb} KB  ->  lib/client.js`)
console.log('[build-client] 自检通过：load(id) 已注册，factory 返回 { inject, apply }')
