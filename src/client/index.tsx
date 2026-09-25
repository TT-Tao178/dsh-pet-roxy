/**
 * dsh-pet-roxy 的 client 半侧入口 —— 一个 dsh client 插件（cordis 插件形状）。
 *
 * 契约（见 dsh-client-modules 源码）：
 *   - package.json 里 `dsh.client.platform` 必须是 "web"，`exports["./client"]` 必须指向本文件
 *     打出来的产物（闭包工厂：window.__ModuleLoader__.load({ id, factory })）
 *   - 本模块导出 `inject`（client 服务名）与 `apply(ctx)`
 *   - factory 里的 `require` 解析的是 loader 的模块表（平台模块）；跨插件 import 是被禁止的
 *
 * 数据面：宠物数据仍走宿主半侧的同源 HTTP 路由（/dsh-pet-roxy/*），所以这里不 inject
 * 任何平台服务；将来要接 harness 主题/设置页/slot 时再逐个加。
 *
 * 与注入式的关系：宿主半侧的 webserver/index-inject 注入（client/roxy-widget.js）仍然保留，
 * 作为「client 半侧没加载成功时宠物也要出现」的兜底。两边同时存在时由这里接管：
 * 调旧 widget 暴露的 teardown 收走它建好的 DOM，避免出现两只洛琪希。
 */
import { createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fetchConfig, putPrefs, type RoxyConfig } from './api'
import { Pet } from './Pet'
import { injectPetStyles } from './styles'

/** 依赖的 client 服务：暂无（数据全走同源 HTTP）。 */
export const inject: string[] = []

/** React 根容器的标记属性，用于幂等与自检。 */
const ROOT_ATTR = 'data-dsh-pet-roxy-react-root'

interface HostWindow extends Window {
  /** client 半侧已加载（对外的持久证据，README 里的验证项）。 */
  __dshPetRoxyClient?: boolean
  /** 本次页面生命周期内 React 版已接管。 */
  __dshPetRoxyReact?: boolean
  /** 注入式 widget 暴露的收尾钩子。 */
  __dshPetRoxyTeardown?: () => void
}

interface Mounted {
  root: Root
  container: HTMLElement
  disposeStyles: () => void
}

let mounted: Mounted | null = null

/**
 * 宠物外壳：先取配置，拿到之后才渲染 Pet。
 * 配置取不到就什么都不渲染 —— 宁可不出现，也不要渲染一只没有表情图的空壳。
 */
function RoxyApp() {
  const [config, setConfig] = useState<RoxyConfig | null>(null)

  useEffect(() => {
    let alive = true
    fetchConfig()
      .then((cfg) => { if (alive) setConfig(cfg) })
      .catch((err: unknown) => {
        console.warn('[dsh-pet-roxy] 读取配置失败，React 宠物不挂载：', err)
      })
    return () => { alive = false }
  }, [])

  if (config === null) return null

  return createElement(Pet, {
    expressions: config.expressions,
    prefs: config.prefs,
    behavior: config.behavior,
    onPersistPlacement: (placement) => {
      putPrefs({ prefs: placement }).catch((err: unknown) => {
        console.warn('[dsh-pet-roxy] 位置持久化失败：', err)
      })
    },
  })
}

/**
 * 让旧的注入式 widget 让位：移除它建的 DOM。
 *
 * 不依赖它自己清定时器 —— 那些定时器只会去写已被移除的元素，不会重建 DOM，
 * 所以移除节点就够，不必改它内部的清理路径。
 */
function takeoverFromInjectedWidget(): void {
  const w = window as HostWindow
  try {
    w.__dshPetRoxyTeardown?.()
  } catch (err) {
    console.warn('[dsh-pet-roxy] 调用旧 widget teardown 失败（忽略）：', err)
  }
  for (const stale of Array.from(document.querySelectorAll('.rx-root'))) stale.remove()
}

/**
 * 挂载 client 半侧。由 harness 的前端模块系统在页面启动期调用一次。
 *
 * @param _ctx - client 根 context（暂未使用；不 inject 任何服务，所以拿不到别的字段）
 */
export function apply(_ctx: unknown): void {
  const w = window as HostWindow
  if (mounted !== null) return // 重复 apply 保持单实例

  w.__dshPetRoxyReact = true
  takeoverFromInjectedWidget()

  const container = document.createElement('div')
  container.setAttribute(ROOT_ATTR, '')
  document.body.appendChild(container)

  const disposeStyles = injectPetStyles()
  const root = createRoot(container)
  root.render(createElement(RoxyApp))

  mounted = { root, container, disposeStyles }
  w.__dshPetRoxyClient = true
  console.log('[dsh-pet-roxy] React client half mounted')
}

/** 卸载（热重载/自检用）：撤掉 React 树、样式与容器。 */
export function unmount(): void {
  if (mounted === null) return
  const current = mounted
  mounted = null
  try {
    current.root.unmount()
  } catch { /* ignore */ }
  current.container.remove()
  current.disposeStyles()
  const w = window as HostWindow
  w.__dshPetRoxyReact = false
  w.__dshPetRoxyClient = false
}
