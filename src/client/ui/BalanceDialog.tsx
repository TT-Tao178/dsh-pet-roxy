/**
 * 余额面板：实时查看账户金额。
 *
 * 打开即强制刷新（带 ?force=1 绕过宿主 25 秒缓存），也可以随时点「立即刷新」。
 * 之所以要 force：后台轮询有缓存与 60 秒节奏，而用户点开面板时想看的是「此刻」，
 * 不是最多 25 秒前的快照。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RoxyBalance } from '../api'
import { fetchBalance } from '../api'
import { formatMoney } from '../speech'
import { syncDialogOpen } from './dialog'

export interface BalanceDialogProps {
  open: boolean
  onClose: () => void
  onToast: (text: string) => void
}

function timeText(ts: number | null): string {
  if (ts === null) return '--'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function BalanceDialog({ open, onClose, onToast }: BalanceDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const [balance, setBalance] = useState<RoxyBalance | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    syncDialogOpen(ref.current, open)
  }, [open])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchBalance(true)
      setBalance(next)
      setUpdatedAt(Date.now())
    } catch (err) {
      onToast('刷新失败：' + String((err as Error)?.message || err).slice(0, 40))
    } finally {
      setLoading(false)
    }
  }, [onToast])

  // 打开即拉一次最新值
  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const ok = balance !== null && balance.ok === true

  return (
    <dialog
      ref={ref}
      className="rx-dialog"
      style={{ height: 'auto', maxHeight: '86vh' }}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose() }}
    >
      <div className="rx-dialog-head">
        <h3>账户金额</h3>
        <button type="button" className="rx-dialog-close" aria-label="关闭" onClick={onClose}>✕</button>
      </div>

      <div className="rx-panel">
        {ok ? (
          <>
            <div className="rx-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ color: '#475569' }}>当前余额</span>
              <span style={{ fontSize: '28px', fontWeight: 800 }}>
                {formatMoney(balance.totalBalance ?? null, balance.currency)}
              </span>
            </div>
            <div className="rx-sep" />
            <div className="rx-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ color: '#475569' }}>今日已用</span>
              <span style={{ fontWeight: 700 }}>{formatMoney(balance.todayUsage ?? 0, balance.currency)}</span>
            </div>
            <div className="rx-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ color: '#475569' }}>当前时段</span>
              <span>{balance.isPeak === true ? '峰时（单价高）' : '谷时（单价低）'}</span>
            </div>
            <div className="rx-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ color: '#475569' }}>用量口径</span>
              <span>{balance.usageMode === 'token' ? '令牌模式（精确）' : '记账模式（余额差值）'}</span>
            </div>
            <div className="rx-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ color: '#475569' }}>更新时间</span>
              <span>{timeText(updatedAt)}{balance.stale === true ? '（缓存值）' : ''}</span>
            </div>
          </>
        ) : (
          <>
            <div className="rx-row" style={{ color: '#ef4444' }}>
              {balance === null ? '正在查询…' : String(balance.error || '拿不到余额。')}
            </div>
            {balance !== null && balance.code === 'NO_KEY' && (
              <div className="rx-row" style={{ color: '#94a3b8' }}>
                在 DSH 的凭据设置里配置 DEEPSEEK_API_KEY 之后才能查询余额。
              </div>
            )}
          </>
        )}

        <div className="rx-sep" />
        <div className="rx-row" style={{ justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="rx-btn" disabled={loading} onClick={() => { void refresh() }}>
            {loading ? '刷新中…' : '立即刷新'}
          </button>
          <button type="button" className="rx-btn rx-btn-primary" onClick={onClose}>关闭</button>
        </div>
        <div className="rx-row" style={{ color: '#94a3b8', fontSize: '11px' }}>
          面板打开时会绕过宿主的 25 秒缓存直接查询；不打开时余额仍按 60 秒节奏在后台刷新。
        </div>
      </div>
    </dialog>
  )
}
