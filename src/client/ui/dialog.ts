/**
 * 原生 <dialog> 的开关工具。
 *
 * 为什么需要它：showModal() 并非处处可用 —— jsdom 就没有实现（client-smoke 直接崩在
 * 这里），某些内嵌 WebView 也可能缺失。直接调用会让整个面板的渲染抛错，而不仅仅是
 * 少一个遮罩。所以在能力缺失时退回 open 属性：没有 backdrop 和焦点陷阱，但面板照常能用。
 */

/**
 * 按 open 幂等地同步一个 dialog 的显隐。
 * @param el - dialog 元素（可能还没挂载，传 null 直接忽略）
 * @param open - 目标状态
 */
export function syncDialogOpen(el: HTMLDialogElement | null, open: boolean): void {
  if (el === null) return

  const canShowModal = typeof el.showModal === 'function'
  const canClose = typeof el.close === 'function'

  if (open) {
    if (el.open) return
    if (canShowModal) {
      try {
        el.showModal()
        return
      } catch {
        // showModal 抛错（例如已经以非模态方式打开过）时退回属性开关
      }
    }
    el.setAttribute('open', '')
    return
  }

  if (!el.open) return
  if (canClose) {
    try {
      el.close()
      return
    } catch {
      // 同上，退回属性开关
    }
  }
  el.removeAttribute('open')
}
