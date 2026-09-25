/**
 * 台词系统：加权分组 + 报告模板。
 *
 * 数据来自宿主下发的 config：
 *   lines        —— 包内默认台词组（assets/roxy-config.json）
 *   speech.customLines —— 用户在设置面板里追加的组
 * 两组结构相同：{ group, weight, items[] }，权重是组级加权，组内等概率。
 *
 * 对应旧实现里的 pickWeighted / 台词挑选那几段；抽出来是便于单测与复用
 * （点击台词、余额台词、任务报告都走这里）。
 */
import type { RoxyConfig } from './api'

/** 一个台词组。字段都可选，因为用户手写的 customLines 可能缺项。 */
export interface LineGroup {
  group?: string
  weight?: number
  items?: string[]
}

/** 合并包内与用户自定义台词组，丢掉空组。 */
export function allLineGroups(config: RoxyConfig): LineGroup[] {
  const groups: LineGroup[] = []
  if (Array.isArray(config.lines)) groups.push(...config.lines)
  const custom = config.speech?.customLines
  if (Array.isArray(custom)) groups.push(...custom)
  return groups.filter((g) => Array.isArray(g.items) && (g.items as string[]).length > 0)
}

/** 组内等概率取一条。 */
function pickFrom(items: string[]): string | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)] ?? null
}

/**
 * 加权随机挑一条台词。
 *
 * 权重全为 0（或缺失）时退化成「先随机选组、再随机选条」，
 * 这样用户把 weight 全填 0 也不会得到 null 而哑掉。
 */
export function pickLine(config: RoxyConfig): string | null {
  const groups = allLineGroups(config)
  if (groups.length === 0) return null

  let total = 0
  for (const g of groups) total += Number(g.weight) || 0

  if (total <= 0) {
    const group = groups[Math.floor(Math.random() * groups.length)]
    return pickFrom(group.items as string[])
  }

  let roll = Math.random() * total
  for (const g of groups) {
    roll -= Number(g.weight) || 0
    if (roll < 0) return pickFrom(g.items as string[])
  }

  const last = groups[groups.length - 1]
  return pickFrom(last.items as string[])
}

/** 把报告模板里的 %title% 换成实际任务名。 */
export function renderReport(template: string, title: string): string {
  return String(template || '').replace(/%title%/g, String(title || ''))
}

/** 金额格式化：CNY（或缺省）用 ¥ 前缀，其他币种跟在后面。 */
export function formatMoney(value: number | null | undefined, currency: string | undefined): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  const cur = String(currency || 'CNY')
  if (cur === 'CNY') return '¥' + n.toFixed(2)
  return n.toFixed(2) + ' ' + cur
}
