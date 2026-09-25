/**
 * dsh-pet-roxy 客户端半侧的样式表。
 *
 * 这套类名（rx-*）原本内联在 client/roxy-widget.js 里，迁移到 React 时原样保留，
 * 目的是让重构期间外观零变化：换掉的只是「谁来渲染」，不是「长什么样」。
 *
 * 由 apply() 注入一次（<style data-plugin="dsh-pet-roxy">），React 组件只引用类名。
 * 注意 rx-root 用 --rx-scale / --rx-base 两个自定义属性驱动整体尺寸，定位与缩放都靠它们。
 */
export const PET_CSS = [
  '.rx-root{position:fixed;left:0;top:0;z-index:9999;pointer-events:none;--rx-scale:1;--rx-base:clamp(96px,calc(min(180px,min(100vw,100vh) * 0.22) * var(--rx-scale)),420px);width:var(--rx-base);height:calc(var(--rx-base) * 1.6);transition:left .16s ease,top .16s ease}',
  '.rx-root.rx-mirror{transform:scaleX(-1)}',
  '.rx-root.rx-dragging{transition:none}',
  '.rx-body{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:auto;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.34,1.56,.64,1);cursor:grab}',
  '.rx-root.rx-dragging .rx-body{cursor:grabbing}',
  '.rx-img{position:absolute;left:0;bottom:0;width:100%;height:var(--rx-base);object-fit:contain;object-position:center bottom;display:block;pointer-events:none;-webkit-user-drag:none;user-select:none;transform-origin:50% 100%}',
  '.rx-root.rx-anim .rx-img{animation:rx-breathe var(--rx-breathe,2.4s) ease-in-out infinite}',
  '@keyframes rx-breathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.03)}}',
  // 镜像：root 整体 scaleX(-1) 翻转角色与气泡一次即可；图片不能再翻（二次翻转=抵消，曾致“左吸附镜像”看不出效果）
  '.rx-bubble{position:absolute;left:0;top:0;width:86%;aspect-ratio:1026/700;pointer-events:none;z-index:1;opacity:0;transition:opacity .2s ease;--rx-u:calc(var(--rx-base) / 1026)}',
  '.rx-bubble.rx-bubble-open{opacity:1}',
  '.rx-bubble svg{display:block;width:100%;height:100%;pointer-events:none}',
  '.rx-bubble svg path,.rx-bubble svg ellipse{pointer-events:auto;cursor:pointer}',
  '.rx-text{position:absolute;left:44.25%;top:38%;transform:translate(-50%,-50%);text-align:center;color:#203170;line-height:1.15;white-space:nowrap;pointer-events:none}',
  '.rx-root.rx-mirror .rx-text{transform:translate(-50%,-50%) scaleX(-1)}',
  '.rx-label{font-size:calc(var(--rx-u) * 66);font-weight:600;letter-spacing:.06em}',
  '.rx-amount{font-size:calc(var(--rx-u) * 128);font-weight:800;line-height:1.05}',
  '.rx-period{font-size:calc(var(--rx-u) * 104);font-weight:800;line-height:1.05}',
  '.rx-hint{font-size:calc(var(--rx-u) * 56);color:#9fb0d9;letter-spacing:.02em;margin-top:calc(var(--rx-u) * 9);min-height:calc(var(--rx-u) * 64);line-height:1.15}',
  '.rx-wrap{white-space:normal;max-width:calc(var(--rx-u) * 560);line-height:1.2}',
  '.rx-menu{position:fixed;min-width:168px;background:rgba(255,255,255,.96);border:1px solid rgba(32,49,112,.35);border-radius:10px;padding:6px;opacity:0;transform:scale(.94) translateY(-4px);transform-origin:top right;transition:opacity .15s ease,transform .18s cubic-bezier(.34,1.56,.64,1);pointer-events:none;z-index:10000;box-shadow:0 6px 18px rgba(0,0,0,.18);color-scheme:light}',
  '.rx-menu.rx-menu-open{opacity:1;transform:scale(1) translateY(0);pointer-events:auto}',
  '.rx-menu-item{display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;padding:8px 10px;border-radius:6px;font-size:13px;color:#203170;cursor:pointer;text-align:left}',
  '.rx-menu-item:hover{background:rgba(32,49,112,.08)}',
  '.rx-dialog{color-scheme:light;border:1px solid rgba(32,49,112,.3);border-radius:12px;padding:0;box-shadow:0 12px 32px rgba(0,0,0,.25);background:#fffdf7;color:#203170;width:min(480px,92vw);height:min(560px,86vh)}',
  '.rx-dialog[open]{display:flex;flex-direction:column;overflow:hidden}',
  '.rx-dialog .rx-panel{overflow-y:auto;flex:1}',
  '.rx-dialog::backdrop{background:rgba(2,6,23,.35)}',
  '.rx-dialog-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(32,49,112,.12);position:sticky;top:0;background:#fffdf7;z-index:2}',
  '.rx-dialog-head h3{margin:0;font-size:16px;font-weight:800}',
  '.rx-dialog-close{border:none;background:rgba(32,49,112,.08);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;color:#203170}',
  '.rx-tabs{display:flex;gap:4px;padding:10px 18px 0;border-bottom:1px solid rgba(32,49,112,.1)}',
  '.rx-tab{border:none;background:transparent;padding:8px 14px;border-radius:8px 8px 0 0;cursor:pointer;font-size:13px;color:#64748b}',
  '.rx-tab.rx-tab-active{background:rgba(32,49,112,.08);color:#203170;font-weight:700}',
  '.rx-panel{padding:16px 18px}',
  '.rx-row{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px;flex-wrap:wrap}',
  '.rx-row label{min-width:96px;color:#475569}',
  '.rx-range{flex:1;min-width:120px;accent-color:#203170}',
  '.rx-number{width:56px;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:3px 6px;font-size:12px;color:#203170;background:#fff}',
  '.rx-check{width:16px;height:16px;accent-color:#203170}',
  '.rx-btn{border:1px solid rgba(32,49,112,.35);background:rgba(32,49,112,.06);color:#203170;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer}',
  '.rx-btn:hover{background:rgba(32,49,112,.12)}',
  '.rx-btn-primary{background:#203170;border-color:#203170;color:#fff}',
  '.rx-btn-primary:hover{background:#2b3f8f}',
  '.rx-sep{height:1px;background:rgba(32,49,112,.12);margin:10px 0}',
  '.rx-slot-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:10px 0}',
  '.rx-slot{border:1px solid rgba(32,49,112,.18);border-radius:8px;padding:8px;text-align:center;background:#fff}',
  '.rx-slot img{width:100%;height:64px;object-fit:contain;display:block;margin-bottom:4px;background:repeating-conic-gradient(#f1f5f9 0 25%,#fff 0 50%) 0 0/12px 12px}',
  '.rx-slot-name{font-size:11px;font-weight:700;color:#203170}',
  '.rx-slot-src{font-size:10px;color:#94a3b8;margin:2px 0 6px;word-break:break-all}',
  '.rx-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}',
  '.rx-stat{border:1px solid rgba(32,49,112,.15);border-radius:10px;padding:10px 8px;text-align:center;background:#fff}',
  '.rx-stat b{display:block;font-size:26px;font-weight:800;line-height:1.1}',
  '.rx-stat span{font-size:11px;color:#64748b}',
  '.rx-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}',
  '.rx-donut-wrap{display:flex;align-items:center;gap:18px;margin:14px 0;flex-wrap:wrap}',
  '.rx-donut{position:relative;width:120px;height:120px;flex:0 0 auto}',
  '.rx-donut svg{width:100%;height:100%;transform:rotate(-90deg)}',
  '.rx-donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;color:#64748b}',
  '.rx-donut-center b{font-size:17px;color:#203170}',
  '.rx-legend{font-size:12px;color:#475569;display:flex;flex-direction:column;gap:4px}',
  '.rx-trend{margin:12px 0}',
  '.rx-trend-row{display:flex;align-items:center;gap:6px;margin:3px 0;font-size:10px;color:#94a3b8}',
  '.rx-trend-bar{flex:1;height:16px;border-radius:4px;overflow:hidden;display:flex;background:#e2e8f0;min-width:60px}',
  '.rx-trend-bar i{display:block;height:100%}',
  '.rx-task-list{margin:10px 0;display:flex;flex-direction:column;gap:4px}',
  '.rx-task{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;font-size:13px;background:#fff}',
  '.rx-task:hover{background:#f1f5f9}',
  '.rx-task-title{flex:1;word-break:break-all}',
  '.rx-task-btn{border:none;background:rgba(32,49,112,.07);border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:12px;color:#203170}',
  '.rx-task-btn:hover{background:rgba(32,49,112,.16)}',
  '.rx-task-del{border:none;background:transparent;cursor:pointer;color:#cbd5e1;font-size:14px;padding:2px 4px}',
  '.rx-task-del:hover{color:#ef4444}',
  '.rx-add-task{display:flex;gap:6px;margin:8px 0}',
  '.rx-add-task input{flex:1;border:1px solid rgba(32,49,112,.35);border-radius:6px;padding:6px 8px;font-size:13px;color:#203170;background:#fff}',
  '.rx-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#203170;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;z-index:10001;box-shadow:0 6px 18px rgba(0,0,0,.25);opacity:0;transition:opacity .2s ease;pointer-events:none}',
  '.rx-toast.rx-toast-on{opacity:1}',
  '.rx-note{position:fixed;width:250px;background:#fff9c4;color:#203170;border-radius:2px;box-shadow:0 10px 24px rgba(0,0,0,.28);padding:26px 14px 12px;transform:rotate(-1.2deg);z-index:10002;font-size:13px;color-scheme:light;pointer-events:auto}',
  '.rx-note::before{content:"";position:absolute;top:-10px;left:50%;transform:translateX(-50%) rotate(2deg);width:64px;height:18px;background:rgba(255,255,255,.6);box-shadow:0 1px 3px rgba(0,0,0,.18);border-radius:1px}',
  '.rx-note input{width:100%;box-sizing:border-box;border:none;background:transparent;border-bottom:1px dashed rgba(32,49,112,.4);padding:6px 2px;font-size:14px;color:#203170;outline:none;font-family:inherit}',
  '.rx-note input:focus{border-bottom-color:#203170}',
  '.rx-note-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:10px}',
  '.rx-note-actions button{border:none;background:rgba(32,49,112,.08);border-radius:6px;padding:5px 12px;font-size:12px;color:#203170;cursor:pointer}',
  '.rx-note-actions button:hover{background:rgba(32,49,112,.16)}',
  '.rx-note-add{background:#203170 !important;color:#fff !important}',
  '@media (max-width:560px){.rx-stats-grid{grid-template-columns:repeat(2,1fr)}.rx-slot-grid{grid-template-columns:repeat(3,1fr)}}',
].join('\n')

/** 样式标签 id，用于幂等注入与卸载清理。 */
export const PET_STYLE_ID = 'dsh-pet-roxy-style'

/** 幂等注入样式表；返回移除函数。 */
export function injectPetStyles(): () => void {
  const existing = document.getElementById(PET_STYLE_ID)
  if (existing !== null) return () => {}

  const style = document.createElement('style')
  style.id = PET_STYLE_ID
  style.dataset.plugin = 'dsh-pet-roxy'
  style.textContent = PET_CSS
  document.head.appendChild(style)

  return () => {
    style.remove()
  }
}
