// ============================================================================
// dsh-pet-roxy 客户端半侧冒烟测试
//
// 用法：node scripts/client-smoke.mjs
//
// 在 jsdom 里真正执行 lib/client.js 并 apply 一次，覆盖构建自检覆盖不到的部分：
//   - 契约：window.__ModuleLoader__.load({ id, factory }) 注册正确
//   - 挂载：apply 之后 DOM 里真的出现宠物（.rx-root / .rx-img），且接管标记置位
//   - 数据：确实按同源路径请求了宿主路由
//   - 交互：右键弹出菜单（4 项）、点击弹出气泡
//
// 不依赖真实 DSH：fetch 被替换成固定响应。因此它验证的是「前端代码自己是否跑得通」，
// 宿主侧的真实行为仍以 scripts/smoke-test.mjs 为准。
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_FILE = path.join(ROOT, 'lib', 'client.js')

if (!fs.existsSync(CLIENT_FILE)) {
  console.error(`[client-smoke] 找不到 ${CLIENT_FILE}，先跑 npm run build`)
  process.exit(1)
}
const CODE = fs.readFileSync(CLIENT_FILE, 'utf8')

// ---------------------------------------------------------------------------
// jsdom 环境
// ---------------------------------------------------------------------------
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const { window } = dom

globalThis.window = window
globalThis.document = window.document
// Node 24 的 globalThis.navigator 是只读 getter，覆盖失败也无妨：
// React 只会读 userAgent 之类的字段，Node 自带的那份够用。
try {
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true })
} catch { /* 保留 Node 自带 navigator */ }

// ---------------------------------------------------------------------------
// fetch 桩：记录调用并按宿主路由回固定数据
// ---------------------------------------------------------------------------
const calls = []
function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  }
}

const FAKE_CONFIG = {
  expressions: { default: 'roxy0.png', happy: 'roxy1.png', surprised: 'roxy2.png', sleepy: 'roxy3.png', angry: 'roxy4.png' },
  reactions: { turnCost: [{ min: 5, expr: 'surprised' }], balanceLow: { threshold: 10, line: '余额不多了。' } },
  prefs: { scale: 1, corner: 'bottom-right', marginX: 16, marginY: 16, mirrorOnLeft: false, animationOn: true, linesOn: true, turnCostOn: true, turnCostCloseMs: 5000 },
  behavior: { breatheMs: 2400, flickEverySec: [10, 20], flickChance: 0.2, flickMs: 1200, sleepyEverySec: [25, 35], sleepyChance: 0.3, sleepyMs: 5000, refreshMs: 60000, bubbleMs: 5000, taskPollMs: 1000 },
  speech: { toggles: { randomLines: true, turnCost: true, balanceLow: true }, customLines: [] },
  lines: [{ group: 'kuudere', weight: 1, items: ['这是一条特意写得很长的台词，用来验证气泡会按字数自动缩小字号，而不是让文字溢出气泡、或者挤成一团把手绘形状撑坏'] }],
  reportLines: { taskAdded: '记下了：%title%。' },
}

globalThis.fetch = async (url, init) => {
  const u = String(url)
  calls.push({ url: u, method: (init && init.method) || 'GET' })
  if (u.includes('/config')) return jsonResponse({ ok: true, config: FAKE_CONFIG })
  if (u.includes('/last-turn.json')) return jsonResponse({ ok: true, seq: 0, turn: null, amount: null, tokens: null, reaction: 'sleepy', ts: null })
  if (u.includes('/balance.json')) return jsonResponse({ ok: true, totalBalance: 45.43, currency: 'CNY', todayUsage: 1.23, usageMode: 'ledger' })
  if (u.includes('/tasks')) return jsonResponse({ ok: true, today: { total: 0, done: 0, doing: 0, failed: 0 }, trend: [], tasks: [] })
  return jsonResponse({ ok: true })
}

// ---------------------------------------------------------------------------
// 断言工具
// ---------------------------------------------------------------------------
let pass = 0
let fail = 0
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + label) } else {
    fail++
    console.log('  ✘ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''))
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// 执行产物：它应当在顶层调用 window.__ModuleLoader__.load
// ---------------------------------------------------------------------------
console.log('== 契约 ==')
let captured = null
window.__ModuleLoader__ = { load(def) { captured = def } }

try {
  // eslint-disable-next-line no-new-func
  new Function(CODE)()
} catch (err) {
  console.log('  ✘ 产物执行抛错: ' + err.message)
  process.exit(1)
}

check('调用了 window.__ModuleLoader__.load', captured !== null)
check('id 正确', captured && captured.id === 'dsh-pet-roxy', captured && captured.id)
check('factory 是函数', captured && typeof captured.factory === 'function')

if (captured === null || typeof captured.factory !== 'function') {
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')
  process.exit(1)
}

let mod = null
try {
  mod = captured.factory(() => { throw new Error('unexpected external require') })
} catch (err) {
  console.log('  ✘ factory 执行抛错: ' + err.message)
  process.exit(1)
}
check('导出 inject 数组', Array.isArray(mod.inject))
check('导出 apply 函数', typeof mod.apply === 'function')

// ---------------------------------------------------------------------------
// 挂载
// ---------------------------------------------------------------------------
console.log('== 挂载 ==')
window.__dshPetRoxyTeardown = () => { /* 假装注入式 widget 已挂载 */ }

mod.apply({})
await wait(200)

check('请求了 /dsh-pet-roxy/config', calls.some((c) => c.url.includes('/dsh-pet-roxy/config')), calls.map((c) => c.url))
check('DOM 出现 .rx-root', window.document.querySelector('.rx-root') !== null)
check('DOM 出现 .rx-img', window.document.querySelector('.rx-img') !== null)
check('接管标记 __dshPetRoxyReact 置位', window.__dshPetRoxyReact === true)
check('加载标记 __dshPetRoxyClient 置位', window.__dshPetRoxyClient === true)
check('样式表已注入', window.document.getElementById('dsh-pet-roxy-style') !== null)

const img = window.document.querySelector('.rx-img')
check('精灵图指向默认表情', img !== null && String(img.getAttribute('src')).includes('roxy0.png'), img && img.getAttribute('src'))

// ---------------------------------------------------------------------------
// 交互：右键菜单
// ---------------------------------------------------------------------------
console.log('== 交互 ==')
const body = window.document.querySelector('.rx-body')
if (body === null) {
  check('宠物本体已挂载（后续交互测试的前提）', false, '找不到 .rx-body')
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')
  process.exit(1)
}

body.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }))
await wait(80)

check('右键后菜单打开', window.document.querySelector('.rx-menu-open') !== null)
check('菜单 5 项', window.document.querySelectorAll('.rx-menu-item').length === 5, window.document.querySelectorAll('.rx-menu-item').length)

// 点「💰 查余额」→ 余额面板应带 force=1 强制刷新（绕过宿主 25 秒缓存）
const balanceItem = Array.from(window.document.querySelectorAll('.rx-menu-item'))
  .find((el) => String(el.textContent || '').includes('查余额'))
check('菜单里有查余额项', balanceItem !== undefined)
if (balanceItem !== undefined) {
  calls.length = 0
  balanceItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await wait(200)
  check('余额面板强制刷新（?force=1）', calls.some((c) => c.url.includes('force=1')), calls.map((c) => c.url))
  check('余额面板已打开', window.document.querySelector('dialog[open]') !== null)
  const dialog = window.document.querySelector('dialog[open]')
  if (dialog !== null) {
    check('面板显示余额 45.43', String(dialog.textContent || '').includes('45.43'), String(dialog.textContent || '').slice(0, 80))
    // jsdom 的 dialog 没有 close()，摘掉 open 属性即可（只为让后续断言干净）
    dialog.removeAttribute('open')
    await wait(80)
  }
}

// 关闭菜单（点别处）
window.document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
await wait(80)
check('点别处后菜单收起', window.document.querySelector('.rx-menu-open') === null)

// ---------------------------------------------------------------------------
// 交互：单击弹气泡（先给余额）
// ---------------------------------------------------------------------------
body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 120, clientY: 120 }))
window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 120, clientY: 120 }))
body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await wait(200)

check('点击后气泡打开', window.document.querySelector('.rx-bubble-open') !== null)
check('气泡里出现余额', String(window.document.querySelector('.rx-bubble')?.textContent || '').includes('45.43'), window.document.querySelector('.rx-bubble')?.textContent)

// 再点一次 → 轮换成台词（必须等过双击窗口，否则会被当成双击犯困）
await wait(400)
body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 120, clientY: 120 }))
window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 120, clientY: 120 }))
body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await wait(200)

const wrap = window.document.querySelector('.rx-wrap')
const wrapStyle = wrap === null ? null : String(wrap.getAttribute('style') || '')
check('再点一次会切成台词', wrap !== null && String(wrap.textContent || '').includes('这是一条特意写得'))
// 长台词的 --rx-fit 必须 < 1：漏掉这个系数，台词就按固定字号渲染，与手绘气泡对不上
check('长台词自动缩字号（--rx-fit < 1）', wrapStyle !== null && /--rx-fit:\s*0\./.test(wrapStyle), wrapStyle)

// ---------------------------------------------------------------------------
// 卸载
// ---------------------------------------------------------------------------
console.log('== 卸载 ==')
if (typeof mod.unmount === 'function') {
  mod.unmount()
  await wait(80)
  check('unmount 后 .rx-root 移除', window.document.querySelector('.rx-root') === null)
  check('unmount 后标记复位', window.__dshPetRoxyReact === false)
} else {
  check('导出 unmount（可选）', true)
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
