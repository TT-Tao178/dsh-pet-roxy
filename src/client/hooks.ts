/**
 * 宿主轮询钩子：每轮消耗结算 + 余额刷新。
 *
 * 宿主没有推送通道（没有 WebSocket/SSE 路由），旧实现也是轮询 —— 这里沿用同一思路，
 * 但把「首次只记录 seq，不弹历史」这件事显式化：否则每次刷新页面都会把上一轮的
 * 消耗当成新结算弹一次。
 */
import { useEffect, useRef } from 'react'
import type { RoxyBalance, RoxyTurn } from './api'
import { fetchBalance, fetchLastTurn } from './api'

export interface TurnWatchOptions {
  /** 是否上报每轮消耗（对应 prefs.turnCostOn）。 */
  turnCostOn: boolean
  /** 轮询间隔（behavior.refreshMs）。 */
  refreshMs: number
  /** 有新一轮结算时调用。 */
  onTurn: (turn: RoxyTurn) => void
  /** 每次成功拿到余额时调用（含低余额提醒的判定由调用方做）。 */
  onBalance: (balance: RoxyBalance) => void
}

export function useTurnWatch(options: TurnWatchOptions): void {
  const { turnCostOn, refreshMs, onTurn, onBalance } = options

  const lastSeqRef = useRef(0)
  const initializedRef = useRef(false)

  useEffect(() => {
    let alive = true

    const tick = async () => {
      if (turnCostOn) {
        try {
          const turn = await fetchLastTurn()
          if (!alive || turn.ok !== true) return
          if (!initializedRef.current) {
            // 首次只对齐基线：页面刷新不该把上一轮当成新结算
            initializedRef.current = true
            lastSeqRef.current = turn.seq
          } else if (turn.seq > lastSeqRef.current) {
            lastSeqRef.current = turn.seq
            onTurn(turn)
          }
        } catch { /* 单轮失败忽略，下一轮再试 */ }
      }

      try {
        const balance = await fetchBalance()
        if (alive && balance.ok === true) onBalance(balance)
      } catch { /* 同上 */ }
    }

    void tick()
    const timer = window.setInterval(() => { void tick() }, Math.max(5_000, refreshMs))
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [turnCostOn, refreshMs, onTurn, onBalance])
}
