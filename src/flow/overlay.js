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
   * @param opts.present  演示态（可选）：
   *   activeIds: Set|null —— 非空时仅这些边流动（null=全部，编辑态）
   *   glows: Map<元素id, color> —— 持续高亮光圈（演示步骤当前节点）
   *   badges: Map<元素id, {kind:'active'|'success', color}> —— 状态徽标
   * @param opts.effectsOn 到达涟漪开关（默认开）
   */
  function render({ arrows, byId, state, time, speed, onArrive, present, effectsOn = true }) {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    ctx.clearRect(0, 0, w, h)

    const activeIds = present?.activeIds ?? null
    const glows = present?.glows
    const badges = present?.badges

    for (const edge of arrows) {
      // 演示态：白名单外的边不流动
      if (activeIds && !activeIds.has(edge.id)) { edge.__prev = null; continue }
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
          if (target && effectsOn) {
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

    // 演示态：节点持续高亮光圈（bbox 外扩呼吸圈）
    if (glows) {
      const breath = 1 + Math.sin(now / 300) * 0.02
      for (const [id, color] of glows) {
        const el = byId.get(id)
        if (!el) continue
        const tl = toViewport({ x: el.x, y: el.y }, state)
        const br = toViewport({ x: el.x + el.width, y: el.y + el.height }, state)
        const pad = 6
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.globalAlpha = 0.9
        roundRect(ctx, tl.x - pad, tl.y - pad, (br.x - tl.x) + pad * 2, (br.y - tl.y) + pad * 2, 10, breath)
        ctx.stroke()
        ctx.globalAlpha = 0.12
        ctx.fillStyle = color
        roundRect(ctx, tl.x - pad, tl.y - pad, (br.x - tl.x) + pad * 2, (br.y - tl.y) + pad * 2, 10, breath)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // 演示态：状态徽标（● 进行中 / ✓ 成功），画在元素右上角
    if (badges) {
      for (const [id, b] of badges) {
        const el = byId.get(id)
        if (!el) continue
        const tr = toViewport({ x: el.x + el.width, y: el.y }, state)
        const r = 9
        const cx = tr.x + 4
        const cy = tr.y - 4
        ctx.fillStyle = b.color
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill()
        ctx.fillStyle = '#0d1017'
        ctx.font = 'bold 11px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(b.kind === 'success' ? '✓' : '●', cx, cy + 0.5)
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r, scale = 1) {
    const cx = x + w / 2, cy = y + h / 2
    const sw = w * scale / 2, sh = h * scale / 2
    ctx.beginPath()
    ctx.moveTo(cx - sw + r, cy - sh)
    ctx.arcTo(cx + sw, cy - sh, cx + sw, cy + sh, r)
    ctx.arcTo(cx + sw, cy + sh, cx - sw, cy + sh, r)
    ctx.arcTo(cx - sw, cy + sh, cx - sw, cy - sh, r)
    ctx.arcTo(cx - sw, cy - sh, cx + sw, cy - sh, r)
    ctx.closePath()
  }

  return { resize, render }
}

/** arrow.customData.flowpulse 的缺省值（UI 与渲染共用） */
export const FLOW_DEFAULTS = { packets: 2, durationMs: 2200 }
