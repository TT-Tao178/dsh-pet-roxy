/**
 * 设置面板：说的话 / 图片 / 行为 三个分页。
 *
 * 对应旧实现的 openSettings 那一大段。分页内各自保存（台词、行为分开提交），
 * 图片则是即时生效（上传/恢复默认立刻打宿主接口），与旧行为一致。
 *
 * 用原生 <dialog showModal> 而不是自绘遮罩：CSS 里的 .rx-dialog / ::backdrop
 * 本来就是为它写的，Esc 关闭与焦点陷阱也免费拿到。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExprKey, RoxyConfig } from '../api'
import { EXPR_KEYS, EXPR_LABELS, deleteUserImage, imageUrl, putPrefs, uploadUserImage } from '../api'

/** 支持的吸附位置（与 Pet 的 snapPlacement 产出的 corner 命名一致）。 */
const CORNERS: Array<{ value: string; label: string }> = [
  { value: 'top-left', label: '左上' },
  { value: 'top-center', label: '上中' },
  { value: 'top-right', label: '右上' },
  { value: 'center-left', label: '左中' },
  { value: 'center-right', label: '右中' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-center', label: '下中' },
  { value: 'bottom-right', label: '右下' },
]

export interface SettingsDialogProps {
  open: boolean
  config: RoxyConfig
  onClose: () => void
  /** 保存成功后刷新配置（让宠物立刻用上新值）。 */
  onReload: () => void
  onToast: (text: string) => void
}

type Tab = 'speech' | 'images' | 'behavior'

/** 把 File 读成 base64（去掉 data URL 前缀）。 */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export function SettingsDialog({ open, config, onClose, onReload, onToast }: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const [tab, setTab] = useState<Tab>('speech')
  const [busy, setBusy] = useState(false)

  // 台词草稿：自定义台词按「每行一条」编辑
  const [customLines, setCustomLines] = useState('')
  const [toggleRandom, setToggleRandom] = useState(true)
  const [toggleTurnCost, setToggleTurnCost] = useState(true)
  const [toggleBalanceLow, setToggleBalanceLow] = useState(true)

  // 行为草稿
  const [scale, setScale] = useState(1)
  const [corner, setCorner] = useState('bottom-right')
  const [animationOn, setAnimationOn] = useState(true)
  const [mirrorOnLeft, setMirrorOnLeft] = useState(false)
  const [turnCostOn, setTurnCostOn] = useState(true)
  const [sleepyChance, setSleepyChance] = useState(0.3)

  // 每次打开都把草稿重置为当前配置
  useEffect(() => {
    if (!open) return
    const custom = config.speech?.customLines ?? []
    setCustomLines(custom.flatMap((g) => (Array.isArray(g.items) ? g.items : [])).join('\n'))
    setToggleRandom(config.speech?.toggles?.randomLines !== false)
    setToggleTurnCost(config.speech?.toggles?.turnCost !== false)
    setToggleBalanceLow(config.speech?.toggles?.balanceLow !== false)
    setScale(Number(config.prefs.scale) || 1)
    setCorner(String(config.prefs.corner || 'bottom-right'))
    setAnimationOn(config.prefs.animationOn !== false)
    setMirrorOnLeft(config.prefs.mirrorOnLeft === true)
    setTurnCostOn(config.prefs.turnCostOn !== false)
    setSleepyChance(Number(config.behavior.sleepyChance) || 0.3)
  }, [open, config])

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  const saveSpeech = useCallback(async () => {
    setBusy(true)
    try {
      const items = customLines.split('\n').map((s) => s.trim()).filter((s) => s !== '')
      await putPrefs({
        speech: {
          toggles: { randomLines: toggleRandom, turnCost: toggleTurnCost, balanceLow: toggleBalanceLow },
          customLines: items.length > 0 ? [{ group: 'custom', weight: 10, items }] : [],
        },
      })
      onToast('台词设置已保存')
      onReload()
    } catch (err) {
      onToast('保存失败：' + String((err as Error)?.message || err).slice(0, 40))
    } finally {
      setBusy(false)
    }
  }, [customLines, toggleRandom, toggleTurnCost, toggleBalanceLow, onToast, onReload])

  const saveBehavior = useCallback(async () => {
    setBusy(true)
    try {
      // 宿主对 prefs / behavior 分开深合并，犯困概率属于 behavior 段
      await putPrefs({
        prefs: { scale, corner, animationOn, mirrorOnLeft, turnCostOn },
        behavior: { sleepyChance },
      })
      onToast('行为设置已保存')
      onReload()
    } catch (err) {
      onToast('保存失败：' + String((err as Error)?.message || err).slice(0, 40))
    } finally {
      setBusy(false)
    }
  }, [scale, corner, animationOn, mirrorOnLeft, turnCostOn, sleepyChance, onToast, onReload])

  const onPickImage = useCallback(async (slot: ExprKey, file: File) => {
    if (file.size > 2 * 1024 * 1024) { onToast('图片超过 2MB'); return }
    const mime = file.type === 'image/jpeg' || file.type === 'image/webp' ? file.type : 'image/png'
    setBusy(true)
    try {
      await uploadUserImage(slot, mime, await readBase64(file))
      onToast(EXPR_LABELS[slot] + ' 已替换')
      onReload()
    } catch (err) {
      onToast('上传失败：' + String((err as Error)?.message || err).slice(0, 40))
    } finally {
      setBusy(false)
    }
  }, [onToast, onReload])

  const onResetImage = useCallback(async (slot: ExprKey) => {
    const current = String(config.expressions[slot] || '')
    if (!current.startsWith('user-image/')) { onToast('该槽位已是默认图'); return }
    setBusy(true)
    try {
      await deleteUserImage(current.slice('user-image/'.length))
      onToast(EXPR_LABELS[slot] + ' 已恢复默认')
      onReload()
    } catch (err) {
      onToast('恢复失败：' + String((err as Error)?.message || err).slice(0, 40))
    } finally {
      setBusy(false)
    }
  }, [config, onToast, onReload])

  return (
    <dialog ref={ref} className="rx-dialog" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose() }}>
      <div className="rx-dialog-head">
        <h3>Roxy 设置</h3>
        <button type="button" className="rx-dialog-close" aria-label="关闭" onClick={onClose}>✕</button>
      </div>

      <div className="rx-tabs">
        {([['speech', '说的话'], ['images', '图片'], ['behavior', '行为']] as Array<[Tab, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={'rx-tab' + (tab === key ? ' rx-tab-active' : '')}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rx-panel">
        {tab === 'speech' && (
          <>
            <div className="rx-row">
              <label>自定义台词</label>
            </div>
            <div className="rx-row">
              <textarea
                className="rx-number"
                style={{ width: '100%', height: '120px', boxSizing: 'border-box', fontFamily: 'inherit' }}
                placeholder="每行一条，会与内置台词一起随机出现"
                value={customLines}
                onChange={(e) => setCustomLines(e.target.value)}
              />
            </div>
            <div className="rx-row">
              <label className="rx-check-label">
                <input type="checkbox" className="rx-check" checked={toggleRandom} onChange={(e) => setToggleRandom(e.target.checked)} />
                {' '}随机台词
              </label>
              <label className="rx-check-label">
                <input type="checkbox" className="rx-check" checked={toggleTurnCost} onChange={(e) => setToggleTurnCost(e.target.checked)} />
                {' '}消耗提醒
              </label>
              <label className="rx-check-label">
                <input type="checkbox" className="rx-check" checked={toggleBalanceLow} onChange={(e) => setToggleBalanceLow(e.target.checked)} />
                {' '}余额低提醒
              </label>
            </div>
            <div className="rx-sep" />
            <button type="button" className="rx-btn rx-btn-primary" disabled={busy} onClick={() => { void saveSpeech() }}>保存</button>
          </>
        )}

        {tab === 'images' && (
          <>
            <div className="rx-row"><label>表情图槽位</label></div>
            <div className="rx-slot-grid">
              {EXPR_KEYS.map((slot) => {
                const value = config.expressions[slot]
                const isUser = String(value).startsWith('user-image/')
                return (
                  <div className="rx-slot" key={slot}>
                    <img src={imageUrl(value)} alt={EXPR_LABELS[slot]} />
                    <div className="rx-slot-name">{EXPR_LABELS[slot]}</div>
                    <div className="rx-slot-src">{isUser ? '自定义' : '默认'}</div>
                    <label className="rx-btn" style={{ display: 'inline-block' }}>
                      上传
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void onPickImage(slot, file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    <button type="button" className="rx-btn" disabled={busy || !isUser} onClick={() => { void onResetImage(slot) }}>默认</button>
                  </div>
                )
              })}
            </div>
            <div className="rx-row" style={{ color: '#94a3b8' }}>PNG / JPEG / WebP，≤2MB，透明背景效果最好。</div>
          </>
        )}

        {tab === 'behavior' && (
          <>
            <div className="rx-row">
              <label>大小</label>
              <input
                type="range" className="rx-range" min="0.6" max="2.5" step="0.05"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
              />
              <span>{Math.round(scale * 100)}%</span>
            </div>
            <div className="rx-row">
              <label>吸附位置</label>
              <select className="rx-number" style={{ width: '96px' }} value={corner} onChange={(e) => setCorner(e.target.value)}>
                {CORNERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="rx-row">
              <label>犯困概率</label>
              <input
                type="range" className="rx-range" min="0" max="1" step="0.05"
                value={sleepyChance}
                onChange={(e) => setSleepyChance(Number(e.target.value))}
              />
              <span>{Math.round(sleepyChance * 100)}%</span>
            </div>
            <div className="rx-row">
              <label className="rx-check-label">
                <input type="checkbox" className="rx-check" checked={animationOn} onChange={(e) => setAnimationOn(e.target.checked)} />
                {' '}呼吸动画
              </label>
              <label className="rx-check-label">
                <input type="checkbox" className="rx-check" checked={mirrorOnLeft} onChange={(e) => setMirrorOnLeft(e.target.checked)} />
                {' '}左吸附镜像
              </label>
              <label className="rx-check-label">
                <input type="checkbox" className="rx-check" checked={turnCostOn} onChange={(e) => setTurnCostOn(e.target.checked)} />
                {' '}消耗表情反应
              </label>
            </div>
            <div className="rx-sep" />
            <button type="button" className="rx-btn rx-btn-primary" disabled={busy} onClick={() => { void saveBehavior() }}>保存</button>
          </>
        )}
      </div>
    </dialog>
  )
}
