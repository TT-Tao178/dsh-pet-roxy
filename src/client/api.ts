/**
 * dsh-pet-roxy 客户端半侧的数据层。
 *
 * 宠物的一切数据仍由宿主半侧（lib/index.js）以同源 HTTP 路由提供，这里只做封装：
 * 路径、超时、JSON 解析和错误归一。React 组件通过它拿数据，不直接 fetch。
 *
 * 为什么继续走 HTTP 而不是 client 服务：宿主半侧的余额、记账、会话消耗都在 Node 侧，
 * 同源路由是最短路径；将来若要接 harness 的主题/设置页，再单独 inject 平台服务。
 */

/** 宿主插件的路由前缀。 */
const BASE = '/dsh-pet-roxy'

/** 单次请求超时（与旧实现一致）。 */
const FETCH_TIMEOUT_MS = 25_000

/** 表情槽位。 */
export const EXPR_KEYS = ['default', 'happy', 'surprised', 'sleepy', 'angry'] as const
export type ExprKey = (typeof EXPR_KEYS)[number]

/** 表情槽位的中文名（设置面板/预览用）。 */
export const EXPR_LABELS: Record<ExprKey, string> = {
  default: '默认',
  happy: '行为一',
  surprised: '行为二',
  sleepy: '行为三',
  angry: '行为四',
}

/** expressions 的值：包内文件名（roxy0.png）或用户图引用（user-image/xxx.png）。 */
export type ExprRef = string

export interface RoxyExpressions extends Record<ExprKey, ExprRef> {}

export interface RoxyPrefs {
  scale: number
  corner: string
  marginX: number
  marginY: number
  mirrorOnLeft: boolean
  animationOn: boolean
  linesOn: boolean
  turnCostOn: boolean
  turnCostCloseMs: number
}

export interface RoxyBehavior {
  breatheMs: number
  flickEverySec: [number, number]
  flickChance: number
  flickMs: number
  sleepyEverySec: [number, number]
  sleepyChance: number
  sleepyMs: number
  refreshMs: number
  bubbleMs: number
  taskPollMs: number
}

export interface RoxySpeech {
  toggles: { randomLines: boolean; turnCost: boolean; balanceLow: boolean }
  customLines: Array<{ group: string; weight: number; items: string[] }>
}

export interface RoxyReactions {
  turnCost: Array<{ min: number; expr: ExprKey }>
  balanceLow: { threshold: number; line: string }
}

export interface RoxyConfig {
  expressions: RoxyExpressions
  reactions: RoxyReactions
  prefs: RoxyPrefs
  behavior: RoxyBehavior
  speech: RoxySpeech
  lines: Array<{ group?: string; weight?: number; items?: string[] }>
  reportLines: Record<string, string>
}

export interface RoxyTask {
  id: string
  title: string
  status: 'todo' | 'doing' | 'done' | 'failed'
  date: string
  created: number
  updated: number
  source?: string
}

export interface RoxyTaskStats {
  total: number
  done: number
  doing: number
  failed: number
}

export interface RoxyTrendRow extends RoxyTaskStats {
  date: string
}

export interface RoxyTasksPayload {
  ok: true
  today: RoxyTaskStats
  trend: RoxyTrendRow[]
  tasks: RoxyTask[]
}

export interface RoxyTurn {
  ok: boolean
  seq: number
  turn: number | null
  amount: number | null
  tokens: number | null
  reaction: ExprKey
  ts: number | null
}

export interface RoxyBalance {
  ok: boolean
  /** 失败时的错误码：NO_KEY / NETWORK / API。 */
  code?: string
  error?: string
  /** 成功时：余额与币种。 */
  totalBalance?: number | null
  currency?: string
  updatedAt?: number
  /** 今日已用（记账或令牌模式，由宿主算好）。 */
  todayUsage?: number
  isPeak?: boolean
  usageMode?: 'ledger' | 'token'
  /** 失败时：网络抖动，可重试。 */
  transient?: boolean
  /** 失败时：返回的是上一次的缓存值。 */
  stale?: boolean
}

/** 宿主 JSON 接口的统一响应外衣（多数路由返回它）。 */
interface Envelope<T> {
  ok: boolean
  code?: string
  error?: string
  [key: string]: unknown
  config?: T
}

/** 带超时的 fetch；失败统一抛 Error（调用方自行降级）。 */
async function request<T>(path: string, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(BASE + path, { ...init, signal: controller.signal })
    const text = await res.text()
    if (text === '') return {} as T
    return JSON.parse(text) as T
  } finally {
    window.clearTimeout(timer)
  }
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/** 拉取完整配置（包内默认 + 用户覆盖，宿主已深合并）。 */
export async function fetchConfig(): Promise<RoxyConfig> {
  const res = await request<Envelope<RoxyConfig>>('/config')
  if (!res || res.config === undefined) throw new Error('config 响应缺少 config 字段')
  return res.config
}

/** PUT /prefs 接受的四段补丁（宿主对这四段分别做深合并）。 */
export interface RoxyPrefsPatch {
  prefs?: Partial<RoxyPrefs>
  speech?: Partial<RoxySpeech>
  behavior?: Partial<RoxyBehavior>
  expressions?: Partial<RoxyExpressions>
}

/** 写偏好/台词/行为/表情映射；未给的段保持不动。 */
export async function putPrefs(patch: RoxyPrefsPatch): Promise<void> {
  const res = await request<Envelope<never>>('/prefs', jsonInit('PUT', patch))
  if (res.ok !== true) throw new Error(res.error || 'prefs 写入失败')
}

export async function fetchTasks(): Promise<RoxyTasksPayload> {
  return await request<RoxyTasksPayload>('/tasks')
}

export async function createTask(title: string): Promise<RoxyTask> {
  const res = await request<Envelope<never> & { task?: RoxyTask }>('/tasks', jsonInit('POST', { title }))
  if (res.ok !== true || res.task === undefined) throw new Error(res.error || '任务创建失败')
  return res.task
}

export async function updateTask(id: string, status: RoxyTask['status']): Promise<RoxyTask> {
  const res = await request<Envelope<never> & { task?: RoxyTask }>(
    '/tasks?id=' + encodeURIComponent(id),
    jsonInit('PATCH', { status }),
  )
  if (res.ok !== true || res.task === undefined) throw new Error(res.error || '任务更新失败')
  return res.task
}

export async function deleteTask(id: string): Promise<void> {
  const res = await request<Envelope<never>>('/tasks?id=' + encodeURIComponent(id), { method: 'DELETE' })
  if (res.ok !== true) throw new Error(res.error || '任务删除失败')
}

export async function fetchBalance(): Promise<RoxyBalance> {
  return await request<RoxyBalance>('/balance.json')
}

export async function fetchLastTurn(): Promise<RoxyTurn> {
  return await request<RoxyTurn>('/last-turn.json')
}

/** 上传自定义表情（base64，魔数由宿主校验）。 */
export async function uploadUserImage(slot: ExprKey, mime: string, base64: string): Promise<string> {
  const res = await request<Envelope<never> & { fileName?: string }>(
    '/user-image',
    jsonInit('POST', { slot, mime, data: base64 }),
  )
  if (res.ok !== true || res.fileName === undefined) throw new Error(res.error || '上传失败')
  return res.fileName
}

export async function deleteUserImage(fileName: string): Promise<void> {
  const res = await request<Envelope<never>>('/user-image?name=' + encodeURIComponent(fileName), { method: 'DELETE' })
  if (res.ok !== true) throw new Error(res.error || '删除失败')
}

/**
 * 把 expressions 里的引用翻译成可直接放进 <img src> 的 URL。
 *
 * 包内图（roxy0.png）走 /image，用户上传图（user-image/xxx.png）走 /user-image——
 * 两条路由的鉴权/校验规则不同，宿主刻意分开，这里不能合并。
 */
export function imageUrl(ref: ExprRef | undefined): string {
  const value = String(ref || '')
  if (value.startsWith('user-image/')) {
    return `${BASE}/user-image?name=${encodeURIComponent(value.slice('user-image/'.length))}`
  }
  return `${BASE}/image?name=${encodeURIComponent(value)}`
}
