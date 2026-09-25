/**
 * dsh-pet-roxy 的 client 半侧入口 —— 一个 dsh client 插件（cordis 插件形状）。
 *
 * 契约（见 dsh-client-modules 源码）：
 *   - package.json 里 `dsh.client.platform` 必须是 "web"，`exports["./client"]` 必须指向本文件
 *     打出来的产物（闭包工厂：window.__ModuleLoader__.load({ id, factory })）
 *   - 本模块导出 `inject`（client 服务名）与 `apply(ctx)`
 *   - factory 里的 `require` 解析的是 loader 的模块表（平台模块）；跨插件 import 是被禁止的
 *
 * 数据面：宠物的一切数据仍走宿主半侧的同源 HTTP 路由（/dsh-pet-roxy/*），
 * 所以这里暂时不 inject 任何平台服务；后续要接主题/设置页/slot 时再逐个加。
 *
 * 阶段 1.0 的 apply 只是一个「加载探针」：先确认 client 机制真的会被 harness
 * 加载并执行，再动那 1500 行页面代码。探针在组件化完成后移除。
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

/** 依赖的 client 服务：暂无（数据全走同源 HTTP）。 */
export const inject: string[] = []

/** 探针容器 id，同时也是幂等标记。 */
const PROBE_ID = 'dsh-pet-roxy-client-probe'

/** 页面上暴露的加载标记，便于在 DevTools 里一眼确认。 */
interface ProbeWindow extends Window {
  __dshPetRoxyClient?: boolean
}

/**
 * 挂载 client 半侧。由 harness 的前端模块系统在页面启动期调用一次。
 *
 * @param _ctx - client 根 context（暂未使用；不 inject 任何服务，所以拿不到别的字段）
 */
export function apply(_ctx: unknown): void {
  const w = window as ProbeWindow
  if (w.__dshPetRoxyClient === true) return // 热重载 / 重复注入时保持单实例
  w.__dshPetRoxyClient = true

  try {
    const existing = document.getElementById(PROBE_ID)
    if (existing !== null) existing.remove()

    const host = document.createElement('div')
    host.id = PROBE_ID
    host.style.opacity = '1'
    host.style.transition = 'opacity .6s ease'
    document.body.appendChild(host)

    createRoot(host).render(
      createElement(
        'div',
        {
          style: {
            position: 'fixed',
            left: '16px',
            top: '16px',
            zIndex: '2147483647',
            background: 'rgba(56, 132, 255, .92)',
            color: '#fff',
            font: '12px/1.6 system-ui, "Microsoft YaHei", sans-serif',
            padding: '6px 10px',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, .25)',
            pointerEvents: 'none',
          },
        },
        '洛琪希 client 半侧已加载（React）',
      ),
    )

    // 探针只是临时的：亮 10 秒后淡出移走，避免挡住界面。
    // window.__dshPetRoxyClient 会一直留着，作为"client 机制已生效"的持久证据。
    window.setTimeout(() => {
      host.style.opacity = '0'
      window.setTimeout(() => host.remove(), 700)
    }, 10_000)

    console.log('[dsh-pet-roxy] client half loaded through window.__ModuleLoader__')
  } catch (err) {
    console.error('[dsh-pet-roxy] client half failed to mount', err)
  }
}
