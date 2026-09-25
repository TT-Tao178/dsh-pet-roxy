/**
 * 气泡：宠物头顶那个手绘对话框。
 *
 * SVG 形状与类名照搬旧实现（见 styles.ts 的 rx-bubble / rx-text 系列），
 * 保证外观零变化；变化的是内容由 React 按状态渲染，而不是命令式改 innerHTML。
 *
 * 三种内容：
 *   line    —— 随机台词（点击轮换）
 *   balance —— 余额 + 今日已用（首次点击）
 *   turn    —— 本轮消耗（宿主结算后自动弹出）
 */
import { formatMoney } from './speech'

export type BubbleContent =
  | { kind: 'line'; text: string }
  | { kind: 'balance'; currency?: string; total: number | null; todayUsage?: number; stale?: boolean; isPeak?: boolean }
  | { kind: 'turn'; amount: number; currency?: string; tokens?: number | null }

export interface BubbleProps {
  open: boolean
  content: BubbleContent | null
}

function renderContent(content: BubbleContent) {
  switch (content.kind) {
    case 'line':
      return <div className="rx-wrap">{content.text}</div>

    case 'balance': {
      const hint: string[] = []
      if (typeof content.todayUsage === 'number') hint.push('今日已用 ' + formatMoney(content.todayUsage, content.currency))
      if (content.stale === true) hint.push('（缓存值）')
      return (
        <>
          <div className="rx-label">余额</div>
          <div className="rx-amount">{formatMoney(content.total, content.currency)}</div>
          <div className="rx-hint">{hint.join(' ')}</div>
        </>
      )
    }

    case 'turn': {
      const hint: string[] = []
      if (typeof content.tokens === 'number' && content.tokens > 0) hint.push(content.tokens.toLocaleString('zh-CN') + ' tokens')
      return (
        <>
          <div className="rx-label">本轮消耗</div>
          <div className="rx-amount">{formatMoney(content.amount, content.currency)}</div>
          <div className="rx-hint">{hint.join(' ')}</div>
        </>
      )
    }
  }
}

export function Bubble({ open, content }: BubbleProps) {
  const visible = open && content !== null
  return (
    <div className={'rx-bubble' + (visible ? ' rx-bubble-open' : '')}>
      <svg viewBox="0 0 1026 700" aria-hidden="true">
        <ellipse className="rx-bshape" cx="454" cy="247" rx="373" ry="232" fill="#FFFDF7" stroke="#203170" strokeWidth="18" strokeLinejoin="round" />
        <path className="rx-bshape" d="M301 465 Q356 448 413 484 Q368 498 301 465 Z" fill="#FFFDF7" stroke="#203170" strokeWidth="18" strokeLinejoin="round" />
        <ellipse className="rx-b1" cx="352" cy="561" rx="37.5" ry="26" fill="#FFFDF7" stroke="#203170" strokeWidth="18" />
        <ellipse className="rx-b2" cx="442" cy="646" rx="24.5" ry="18" fill="#FFFDF7" stroke="#203170" strokeWidth="18" />
      </svg>
      <div className="rx-text">{content === null ? null : renderContent(content)}</div>
    </div>
  )
}
