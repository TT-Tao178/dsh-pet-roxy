/**
 * 宠物本体：精灵图 + 定位 + 拖拽吸附 + 点击/双击反应。
 *
 * 迁移说明：这里是 client/roxy-widget.js 里「② DOM 构建 / ③ 表情系统 / ④ 行为状态机 /
 * ⑤ 定位与吸附」四段的 React 重写。类名与动画仍走 styles.ts 里那套 rx-* CSS，
 * 所以外观与旧实现一致；变的是渲染与状态管理方式（命令式 DOM → React state）。
 *
 * 位置模型：不存自由坐标，只存 (corner, marginX, marginY) —— 与宿主 prefs 同构，
 * 拖拽松手时把落点吸附成最近的四边/四角，因此窗口大小变化后位置依然正确。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExprKey, RoxyBehavior, RoxyExpressions, RoxyPrefs } from './api'
import { imageUrl } from './api'

/** 单击与拖拽的分界（位移平方 < 25，即 < 5px）。 */
const CLICK_SQ = 25

/** 双击判定窗口（毫秒）。 */
const DOUBLE_CLICK_MS = 320

/** 吸附阈：中心落在视口 1/3 之内算靠边，否则算居中。 */
const SNAP_RATIO = 1 / 3

export interface PetProps {
  expressions: RoxyExpressions
  prefs: RoxyPrefs
  behavior: RoxyBehavior
  /** 拖拽吸附后把新位置写回宿主（宿主负责持久化）。 */
  onPersistPlacement: (placement: { corner: string; marginX: number; marginY: number }) => void
}

type Corner = string

interface Box {
  w: number
  h: number
}

interface Viewport {
  w: number
  h: number
}

/** 把 (corner, margin) 换算成左上角坐标。 */
function computePosition(corner: Corner, marginX: number, marginY: number, box: Box, vp: Viewport) {
  const [vert, horiz] = corner.split('-')

  let left: number
  if (horiz === 'left') left = marginX
  else if (horiz === 'right') left = vp.w - box.w - marginX
  else left = (vp.w - box.w) / 2

  let top: number
  if (vert === 'top') top = marginY
  else if (vert === 'bottom') top = vp.h - box.h - marginY
  else top = (vp.h - box.h) / 2

  return { left, top }
}

/** 把落点吸附成最近的四边/四角，并折算成该边距。 */
function snapPlacement(x: number, y: number, box: Box, vp: Viewport) {
  const cx = x + box.w / 2
  const cy = y + box.h / 2

  let horiz: 'left' | 'center' | 'right'
  if (cx < vp.w * SNAP_RATIO) horiz = 'left'
  else if (cx > vp.w * (1 - SNAP_RATIO)) horiz = 'right'
  else horiz = 'center'

  let vert: 'top' | 'center' | 'bottom'
  if (cy < vp.h * SNAP_RATIO) vert = 'top'
  else if (cy > vp.h * (1 - SNAP_RATIO)) vert = 'bottom'
  else vert = 'center'

  // 完全居中不像「吸附到四边或四角」，按更近的一侧收回
  if (vert === 'center' && horiz === 'center') {
    if (vp.h - cy < cy) vert = 'bottom'
    else if (cy < vp.h - cy) vert = 'top'
  }

  const corner = `${vert}-${horiz}`
  let marginX = 0
  let marginY = 0
  if (horiz === 'left') marginX = Math.max(0, Math.round(x))
  else if (horiz === 'right') marginX = Math.max(0, Math.round(vp.w - (x + box.w)))
  if (vert === 'top') marginY = Math.max(0, Math.round(y))
  else if (vert === 'bottom') marginY = Math.max(0, Math.round(vp.h - (y + box.h)))

  return { corner, marginX, marginY }
}

export function Pet({ expressions, prefs, behavior, onPersistPlacement }: PetProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  const [expr, setExpr] = useState<ExprKey>('default')
  const [corner, setCorner] = useState<Corner>(prefs.corner)
  const [marginX, setMarginX] = useState<number>(prefs.marginX)
  const [marginY, setMarginY] = useState<number>(prefs.marginY)
  const [box, setBox] = useState<Box>({ w: 0, h: 0 })
  const [viewport, setViewport] = useState<Viewport>(() => ({
    w: window.innerWidth || document.documentElement.clientWidth,
    h: window.innerHeight || document.documentElement.clientHeight,
  }))

  /** 拖拽中的实时落点；非拖拽时为 null（回到 corner 推导）。 */
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null)
  const dragRef = useRef<{ id: number; startX: number; startY: number; originLeft: number; originTop: number; moved: boolean } | null>(null)
  const dragging = dragPos !== null

  // ---- 尺寸与视口测量：--rx-base 由 CSS clamp 算，JS 只负责量出来 ----
  useEffect(() => {
    const el = rootRef.current
    if (el === null) return
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    return undefined
  }, [prefs.scale])

  useEffect(() => {
    const onResize = () => setViewport({
      w: window.innerWidth || document.documentElement.clientWidth,
      h: window.innerHeight || document.documentElement.clientHeight,
    })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const position = useMemo(
    () => dragPos ?? computePosition(corner, marginX, marginY, box, viewport),
    [dragPos, corner, marginX, marginY, box, viewport],
  )

  // ---- 随机表情：工作态闪烁 + 犯困（对应旧实现的 flick / sleepy） ----
  const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))

  useEffect(() => {
    const [lo, hi] = behavior.flickEverySec
    let flickTimer = 0
    const scheduleFlick = () => {
      flickTimer = window.setTimeout(() => {
        if (Math.random() < behavior.flickChance) {
          setExpr(Math.random() < 0.5 ? 'happy' : 'sleepy')
          window.setTimeout(() => setExpr('default'), behavior.flickMs)
        }
        scheduleFlick()
      }, randInt(lo, hi) * 1000)
    }
    scheduleFlick()
    return () => window.clearTimeout(flickTimer)
  }, [behavior.flickEverySec, behavior.flickChance, behavior.flickMs])

  useEffect(() => {
    const [lo, hi] = behavior.sleepyEverySec
    let sleepyTimer = 0
    const scheduleSleepy = () => {
      sleepyTimer = window.setTimeout(() => {
        if (Math.random() < behavior.sleepyChance) {
          setExpr('angry')
          window.setTimeout(() => setExpr('default'), behavior.sleepyMs)
        }
        scheduleSleepy()
      }, randInt(lo, hi) * 1000)
    }
    scheduleSleepy()
    return () => window.clearTimeout(sleepyTimer)
  }, [behavior.sleepyEverySec, behavior.sleepyChance, behavior.sleepyMs])

  // ---- 指针交互：单击换表情 / 拖拽移动并吸附 ----
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = rootRef.current
    if (el === null) return
    dragRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: position.left,
      originTop: position.top,
      moved: false,
    }
    setDragPos({ left: position.left, top: position.top })
  }, [position.left, position.top])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (drag === null || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (!drag.moved && dx * dx + dy * dy > CLICK_SQ) drag.moved = true
      if (!drag.moved) return
      setDragPos({ left: drag.originLeft + dx, top: drag.originTop + dy })
    }

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current
      if (drag === null || e.pointerId !== drag.id) return
      dragRef.current = null

      if (!drag.moved) {
        setDragPos(null)
        // 单击：行为一/行为二随机二选一
        setExpr(Math.random() < 0.5 ? 'happy' : 'surprised')
        return
      }

      // 吸附：把当前落点折算回 (corner, margin) 并持久化
      const current = rootRef.current
      if (current === null) {
        setDragPos(null)
        return
      }
      const left = drag.originLeft + (e.clientX - drag.startX)
      const top = drag.originTop + (e.clientY - drag.startY)
      const snapped = snapPlacement(left, top, box, viewport)
      setCorner(snapped.corner)
      setMarginX(snapped.marginX)
      setMarginY(snapped.marginY)
      setDragPos(null)
      onPersistPlacement(snapped)
    }

    const onCancel = (e: PointerEvent) => {
      const drag = dragRef.current
      if (drag === null || e.pointerId !== drag.id) return
      dragRef.current = null
      setDragPos(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [box, viewport, onPersistPlacement])

  // 双击：犯困（行为四）
  const lastClickRef = useRef(0)
  const onDoubleClick = useCallback(() => {
    setExpr('angry')
    window.setTimeout(() => setExpr('default'), behavior.sleepyMs)
  }, [behavior.sleepyMs])

  const onBodyClick = useCallback(() => {
    const now = Date.now()
    if (now - lastClickRef.current < DOUBLE_CLICK_MS) {
      lastClickRef.current = 0
      onDoubleClick()
      return
    }
    lastClickRef.current = now
  }, [onDoubleClick])

  const mirrored = prefs.mirrorOnLeft && corner.includes('left')

  const rootClass = [
    'rx-root',
    mirrored ? 'rx-mirror' : '',
    dragging ? 'rx-dragging' : '',
    prefs.animationOn ? 'rx-anim' : '',
  ].filter(Boolean).join(' ')

  const rootStyle = {
    left: `${Math.round(position.left)}px`,
    top: `${Math.round(position.top)}px`,
    '--rx-scale': String(prefs.scale),
    '--rx-breathe': `${behavior.breatheMs}ms`,
  } as React.CSSProperties

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={rootStyle}
      role="img"
      aria-label="洛琪希宠物挂件"
      data-dsh-pet-roxy=""
    >
      <div
        className="rx-body"
        onPointerDown={onPointerDown}
        onClick={onBodyClick}
        onDoubleClick={onDoubleClick}
      >
        <img
          className="rx-img"
          src={imageUrl(expressions[expr])}
          alt="洛琪希"
          draggable={false}
        />
      </div>
    </div>
  )
}
