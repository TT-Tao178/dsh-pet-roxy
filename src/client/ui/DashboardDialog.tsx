/**
 * 数据统计面板：今日四态卡片 + 环形图 + 7 天趋势 + 任务清单。
 *
 * 对应旧实现的 openDashboard 那段。数据全部来自宿主 /dsh-pet-roxy/tasks，
 * 打开期间按 behavior.taskPollMs 轮询（旧实现同样靠轮询，宿主没有推送通道）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RoxyTask, RoxyTasksPayload } from '../api'
import { createTask, deleteTask, fetchTasks, updateTask } from '../api'
import { syncDialogOpen } from './dialog'

const STATUS_META: Record<RoxyTask['status'], { label: string; color: string; mark: string }> = {
  todo: { label: '待办', color: '#94a3b8', mark: '○' },
  doing: { label: '进行中', color: '#3b82f6', mark: '◐' },
  done: { label: '已完成', color: '#22c55e', mark: '●' },
  failed: { label: '失败', color: '#ef4444', mark: '✕' },
}

/** 点状态按钮时的轮转顺序。 */
const STATUS_CYCLE: RoxyTask['status'][] = ['todo', 'doing', 'done', 'failed']

export interface DashboardDialogProps {
  open: boolean
  pollMs: number
  onClose: () => void
  onToast: (text: string) => void
}

function Donut({ payload }: { payload: RoxyTasksPayload }) {
  const { today } = payload
  const segments = [
    { key: 'done', value: today.done, color: STATUS_META.done.color },
    { key: 'doing', value: today.doing, color: STATUS_META.doing.color },
    { key: 'failed', value: today.failed, color: STATUS_META.failed.color },
  ]
  // todo 就是剩下没被三态覆盖的部分
  const rest = Math.max(0, today.total - today.done - today.doing - today.failed)

  const radius = 54
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="rx-donut-wrap">
      <div className="rx-donut">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="14" />
          {segments.map((seg) => {
            const ratio = today.total > 0 ? seg.value / today.total : 0
            const dash = `${(ratio * circumference).toFixed(2)} ${(circumference - ratio * circumference).toFixed(2)}`
            const el = (
              <circle
                key={seg.key}
                cx="60" cy="60" r={radius}
                fill="none" stroke={seg.color} strokeWidth="14"
                strokeDasharray={dash}
                strokeDashoffset={(-offset * circumference).toFixed(2)}
              />
            )
            offset += ratio
            return el
          })}
        </svg>
        <div className="rx-donut-center">
          <b>{today.total}</b>
          <span>今日任务</span>
        </div>
      </div>
      <div className="rx-legend">
        <span><i className="rx-dot" style={{ background: STATUS_META.done.color }} />已完成 {today.done}</span>
        <span><i className="rx-dot" style={{ background: STATUS_META.doing.color }} />进行中 {today.doing}</span>
        <span><i className="rx-dot" style={{ background: STATUS_META.failed.color }} />失败 {today.failed}</span>
        <span><i className="rx-dot" style={{ background: STATUS_META.todo.color }} />待办 {rest}</span>
      </div>
    </div>
  )
}

export function DashboardDialog({ open, pollMs, onClose, onToast }: DashboardDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const [payload, setPayload] = useState<RoxyTasksPayload | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    syncDialogOpen(ref.current, open)
  }, [open])

  // 打开期间轮询；关闭即停，避免后台空转
  useEffect(() => {
    if (!open) return
    let alive = true
    const tick = async () => {
      try {
        const next = await fetchTasks()
        if (alive) setPayload(next)
      } catch { /* 轮询失败静默，下一轮再试 */ }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, Math.max(500, pollMs))
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [open, pollMs])

  const add = useCallback(async () => {
    const title = draft.trim()
    if (title === '') return
    try {
      await createTask(title)
      setDraft('')
      setPayload(await fetchTasks())
    } catch (err) {
      onToast('添加失败：' + String((err as Error)?.message || err).slice(0, 40))
    }
  }, [draft, onToast])

  const cycle = useCallback(async (task: RoxyTask) => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.status) + 1) % STATUS_CYCLE.length]
    try {
      await updateTask(task.id, next)
      setPayload(await fetchTasks())
    } catch (err) {
      onToast('更新失败：' + String((err as Error)?.message || err).slice(0, 40))
    }
  }, [onToast])

  const remove = useCallback(async (task: RoxyTask) => {
    try {
      await deleteTask(task.id)
      setPayload(await fetchTasks())
    } catch (err) {
      onToast('删除失败：' + String((err as Error)?.message || err).slice(0, 40))
    }
  }, [onToast])

  const today = payload?.today ?? { total: 0, done: 0, doing: 0, failed: 0 }
  const trend = payload?.trend ?? []
  const tasks = payload?.tasks ?? []
  const trendMax = Math.max(1, ...trend.map((r) => r.total))

  return (
    <dialog ref={ref} className="rx-dialog" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose() }}>
      <div className="rx-dialog-head">
        <h3>Roxy 的数据统计</h3>
        <button type="button" className="rx-dialog-close" aria-label="关闭" onClick={onClose}>✕</button>
      </div>

      <div className="rx-panel">
        <div className="rx-stats-grid">
          <div className="rx-stat"><b>{today.total}</b><span>今日任务</span></div>
          <div className="rx-stat"><b style={{ color: STATUS_META.done.color }}>{today.done}</b><span>已完成</span></div>
          <div className="rx-stat"><b style={{ color: STATUS_META.doing.color }}>{today.doing}</b><span>进行中</span></div>
          <div className="rx-stat"><b style={{ color: STATUS_META.failed.color }}>{today.failed}</b><span>失败</span></div>
        </div>

        {payload !== null && <Donut payload={payload} />}

        <div className="rx-trend">
          <div className="rx-row"><label>最近 7 天</label></div>
          {trend.map((row) => (
            <div className="rx-trend-row" key={row.date}>
              <span style={{ width: '40px' }}>{row.date.slice(5)}</span>
              <div className="rx-trend-bar">
                <i style={{ width: `${(row.done / trendMax) * 100}%`, background: STATUS_META.done.color }} />
                <i style={{ width: `${(row.doing / trendMax) * 100}%`, background: STATUS_META.doing.color }} />
                <i style={{ width: `${(row.failed / trendMax) * 100}%`, background: STATUS_META.failed.color }} />
              </div>
              <span style={{ width: '24px', textAlign: 'right' }}>{row.total}</span>
            </div>
          ))}
        </div>

        <div className="rx-sep" />
        <div className="rx-add-task">
          <input
            value={draft}
            placeholder="添加任务，回车贴上"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
          />
          <button type="button" className="rx-btn rx-btn-primary" onClick={() => { void add() }}>添加</button>
        </div>

        <div className="rx-task-list">
          {tasks.map((task) => {
            const meta = STATUS_META[task.status] ?? STATUS_META.todo
            return (
              <div className="rx-task" key={task.id}>
                <button
                  type="button"
                  className="rx-task-btn"
                  title="切换状态"
                  style={{ color: meta.color }}
                  onClick={() => { void cycle(task) }}
                >
                  {meta.mark}
                </button>
                <span className="rx-task-title" style={{ opacity: task.status === 'done' ? 0.55 : 1 }}>
                  {task.title}
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{task.date.slice(5)}</span>
                <button type="button" className="rx-task-del" title="删除" onClick={() => { void remove(task) }}>✕</button>
              </div>
            )
          })}
          {tasks.length === 0 && (
            <div className="rx-row" style={{ color: '#94a3b8' }}>还没有任务。上面加一条，或者右键她说「添加任务」。</div>
          )}
        </div>
      </div>
    </dialog>
  )
}
