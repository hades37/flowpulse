import { progresses, lerpPoint } from './kinematics.js'

/**
 * overlay 渲染器：叠在 Excalidraw 画布之上的透明 canvas。
 * 只读它的 scene（boundArrow + bbox + appState 变换），
 * 不污染场景数据 —— 数据包 / 涟漪 / 到达光圈全部画在自己层上。
 *
 * 每条箭头的动画参数存于 arrow.customData.flowpulse = { packets, durationMs }
 * （Excalidraw 官方字段：随场景序列化 / 撤销 / 协作白送）。
 */

const TAU = Math.PI * 2

export function createOverlay(canvas) {
  const ctx = canvas.getContext('2d')
  let ripples = [] // { cx, cy, color, born }

  function resize(w, h, dpr = window.devicePixelRatio || 1) {
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** 场景坐标 → 视口坐标（Excalidraw 变换：(scene + scroll) * zoom；zoom 是 {value} 对象） */
  function toViewport(p, st) {
    const z = st.zoom?.value ?? 1
    return { x: (p.x + st.scrollX) * z, y: (p.y + st.scrollY) * z }
  }

  /**
   * 渲染一帧
   * @param opts.arrows   绑定箭头元素
   * @param opts.byId     id → 元素 映射
   * @param opts.state    appState（scrollX/scrollY/zoom）
   * @param opts.time     播放时钟 ms
   * @param opts.speed    全局速度倍率
   * @param opts.onArrive(edge, targetElement) 到达回调
   */
  function render({ arrows, byId, state, time, speed, onArrive }) {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    ctx.clearRect(0, 0, w, h)

    for (const edge of arrows) {
      const pts = edge.points
      if (!pts || pts.length < 2) continue
      const a = { x: edge.x + pts[0][0], y: edge.y + pts[0][1] }
      const b = { x: edge.x + pts[pts.length - 1][0], y: edge.y + pts[pts.length - 1][1] }
      const color = edge.strokeColor || '#6ea8ff'

      const fp = edge.customData?.flowpulse ?? {}
      const n = Math.max(1, fp.packets ?? 2)
      const dur = (fp.durationMs ?? 2200) / (speed ?? 1)

      const list = progresses(time, n, dur)
      edge.__prev = edge.__prev ?? list

      for (let i = 0; i < n; i++) {
        // 到达检测：帧间 progress 回绕即到达（触发目标涟漪）
        if (edge.__prev[i] > list[i] && onArrive) {
          const targetId = edge.end?.id ?? edge.endBinding?.elementId
          const target = targetId ? byId.get(targetId) : null
          if (target) {
            const c = toViewport(
              { x: target.x + target.width / 2, y: target.y + target.height / 2 },
              state,
            )
            ripples.push({ cx: c.x, cy: c.y, color, born: performance.now() })
          }
        }

        const p = list[i]
        const sp = toViewport(lerpPoint(a, b, p), state)
        // 光晕 + 实心光点
        ctx.globalAlpha = 0.22
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, 8, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, 3.8, 0, TAU)
        ctx.fill()
      }
      edge.__prev = list
    }

    // 涟漪（0.8s 扩散消散），数量上限防积压
    const now = performance.now()
    ripples = ripples.filter((r) => now - r.born < 800).slice(-40)
    for (const r of ripples) {
      const k = (now - r.born) / 800
      ctx.globalAlpha = (1 - k) * 0.85
      ctx.strokeStyle = r.color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(r.cx, r.cy, 12 + k * 34, 0, TAU)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  return { resize, render }
}

/** arrow.customData.flowpulse 的缺省值（UI 与渲染共用） */
export const FLOW_DEFAULTS = { packets: 2, durationMs: 2200 }
