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
      className="rx-dialog rx-dialog-compact"
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
            <div className="rx-balance-hero">
              <b>{formatMoney(balance.totalBalance ?? null, balance.currency)}</b>
              <span>账户余额 · {timeText(updatedAt)} 更新{balance.stale === true ? '（缓存值）' : ''}</span>
            </div>
            <div className="rx-kv">
              <span>今日已用</span>
              <b>{formatMoney(balance.todayUsage ?? 0, balance.currency)}</b>
            </div>
            <div className="rx-kv">
              <span>当前时段</span>
              <span>{balance.isPeak === true ? '峰时（单价高）' : '谷时（单价低）'}</span>
            </div>
            <div className="rx-kv">
              <span>用量口径</span>
              <span>{balance.usageMode === 'token' ? '令牌模式' : '记账模式'}</span>
            </div>
          </>
        ) : (
          <>
            <div className="rx-kv" style={{ color: '#ef4444' }}>
              <span>{balance === null ? '正在查询…' : String(balance.error || '拿不到余额。')}</span>
            </div>
            {balance !== null && balance.code === 'NO_KEY' && (
              <div className="rx-kv">
                <span>在 DSH 凭据里配置 DEEPSEEK_API_KEY 后才能查询。</span>
              </div>
            )}
          </>
        )}

        <div className="rx-dialog-actions">
          <button type="button" className="rx-btn" disabled={loading} onClick={() => { void refresh() }}>
            {loading ? '刷新中…' : '立即刷新'}
          </button>
          <button type="button" className="rx-btn rx-btn-primary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </dialog>
  )
}
