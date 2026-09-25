/**
 * 覆盖层三件套：Toast、右键菜单、添加任务便签。
 *
 * 三者都渲染在 .rx-root **之外**（position:fixed 定位于视口）。
 * 这不是风格问题：.rx-root 在左吸附镜像时会带 transform:scaleX(-1)，
 * 挂进去的浮层会跟着被水平翻转，文字会反过来。
 *
 * 对应旧实现的 openContextMenu / toast / 便签那几段。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** 视口内夹取，留 4px 边距。 */
function clampToViewport(x: number, y: number, w: number, h: number) {
  const vw = window.innerWidth || document.documentElement.clientWidth
  const vh = window.innerHeight || document.documentElement.clientHeight
  return {
    left: Math.min(Math.max(4, x), Math.max(4, vw - w - 4)),
    top: Math.min(Math.max(4, y), Math.max(4, vh - h - 4)),
  }
}

export interface MenuItem {
  label: string
  onSelect: () => void
}

export interface ContextMenuProps {
  open: boolean
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 先渲染再测量，把菜单夹进视口内（旧实现同样先摆放再校正）
  useEffect(() => {
    if (!open) return
    const el = ref.current
    if (el === null) return
    const rect = el.getBoundingClientRect()
    setPos(clampToViewport(x, y, rect.width, rect.height))
  }, [open, x, y, items.length])

  // 点别处 / Esc 关闭（捕获阶段，先于页面其他处理）
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const el = ref.current
      // 刻意不写 `e.target instanceof Node`：Node 属于页面全局，在非浏览器宿主
      // （client-smoke 的 jsdom 环境）里并不存在，会直接抛 ReferenceError。
      // contains() 对非节点参数返回 false，语义已经够用。
      if (el !== null && e.target !== null && el.contains(e.target as globalThis.Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div
      ref={ref}
      className={'rx-menu' + (open ? ' rx-menu-open' : '')}
      role="menu"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="rx-menu-item"
          onClick={() => { onClose(); item.onSelect() }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function Toast({ text }: { text: string | null }) {
  return <div className={'rx-toast' + (text !== null ? ' rx-toast-on' : '')}>{text ?? ''}</div>
}

export interface NoteInputProps {
  open: boolean
  x: number
  y: number
  onSubmit: (title: string) => void
  onCancel: () => void
}

/** 添加任务的黄色便签。 */
export function NoteInput({ open, x, y, onSubmit, onCancel }: NoteInputProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open) setValue('')
  }, [open])

  const submit = useCallback(() => {
    const title = value.trim()
    if (title === '') { onCancel(); return }
    onSubmit(title)
  }, [value, onSubmit, onCancel])

  if (!open) return null

  const rect = ref.current?.getBoundingClientRect()
  const pos = clampToViewport(x, y, rect?.width ?? 250, rect?.height ?? 120)

  return (
    <div ref={ref} className="rx-note" style={{ left: `${pos.left}px`, top: `${pos.top}px` }}>
      <input
        autoFocus
        value={value}
        placeholder="要记什么？"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
      />
      <div className="rx-note-actions">
        <button type="button" onClick={onCancel}>取消</button>
        <button type="button" className="rx-note-add" onClick={submit}>贴上</button>
      </div>
    </div>
  )
}
