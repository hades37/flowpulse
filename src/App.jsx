import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw'

import { createOverlay } from './flow/overlay.js'
import './styles.css'

/* 初始微服务场景（Excalidraw 简写元素 → 完整 schema） */
const initialElements = convertToExcalidrawElements([
  {
    type: 'rectangle', id: 'client', x: 80, y: 300, width: 170, height: 76,
    label: { text: '📱 客户端', fontSize: 20 },
    strokeColor: '#57d68f', fillStyle: 'solid', roughness: 0, strokeWidth: 2,
  },
  {
    type: 'rectangle', id: 'gateway', x: 380, y: 300, width: 170, height: 76,
    label: { text: '🛡️ API 网关', fontSize: 20 },
    strokeColor: '#6ea8ff', fillStyle: 'solid', roughness: 0, strokeWidth: 2,
  },
  {
    type: 'diamond', id: 'auth', x: 680, y: 120, width: 200, height: 110,
    label: { text: '🔑 鉴权', fontSize: 20 },
    strokeColor: '#ffb454', fillStyle: 'solid', roughness: 0, strokeWidth: 2,
  },
  {
    type: 'rectangle', id: 'order', x: 680, y: 420, width: 180, height: 76,
    label: { text: '📦 订单服务', fontSize: 20 },
    strokeColor: '#6ea8ff', fillStyle: 'solid', roughness: 0, strokeWidth: 2,
  },
  {
    type: 'ellipse', id: 'db', x: 1000, y: 420, width: 190, height: 96,
    label: { text: '🗄️ 数据库', fontSize: 20 },
    strokeColor: '#ff7a7a', fillStyle: 'solid', roughness: 0, strokeWidth: 2,
  },
  { type: 'arrow', x: 250, y: 338, strokeColor: '#57d68f', strokeWidth: 2, roughness: 0,
    start: { id: 'client', type: 'arrow' }, end: { id: 'gateway', type: 'arrow' } },
  { type: 'arrow', x: 550, y: 338, strokeColor: '#ffb454', strokeWidth: 2, roughness: 0,
    start: { id: 'gateway', type: 'arrow' }, end: { id: 'auth', type: 'arrow' } },
  { type: 'arrow', x: 550, y: 338, strokeColor: '#6ea8ff', strokeWidth: 2, roughness: 0,
    start: { id: 'gateway', type: 'arrow' }, end: { id: 'order', type: 'arrow' } },
  { type: 'arrow', x: 860, y: 458, strokeColor: '#ff7a7a', strokeWidth: 2, roughness: 0,
    start: { id: 'order', type: 'arrow' }, end: { id: 'db', type: 'arrow' } },
])

export default function App() {
  const apiRef = useRef(null)
  const wrapRef = useRef(null)
  const overlayRef = useRef(null)
  const overlayApiRef = useRef(null)

  const [flowing, setFlowing] = useState(true)
  const [speed, setSpeed] = useState(1)
  // 播放态走 ref 供 RAF 读取（控制条即时生效）
  const playRef = useRef({ flowing: true, speed: 1 })
  playRef.current = { flowing, speed }

  const onReady = useCallback((api) => {
    apiRef.current = api
    if (import.meta.env.DEV) window.__exApi = api
    // 0.18 无限画布：元素渲染在 ~16M offset 区域，初始 scroll=0 对着空白窗口，
    // 挂载稳定后把视口对到内容（过早调用会触发未挂载 setState 警告）
    setTimeout(() => {
      try {
        api.scrollToContent(api.getSceneElements(), {
          fitToViewport: true,
          viewportZoomFactor: 0.75,
        })
      } catch { /* 场景为空时忽略 */ }
    }, 800)
  }, [])

  /* overlay 尺寸跟随容器 */
  useEffect(() => {
    const canvas = overlayRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    overlayApiRef.current = createOverlay(canvas)
    const ro = new ResizeObserver(() => {
      overlayApiRef.current?.resize(wrap.clientWidth, wrap.clientHeight)
    })
    ro.observe(wrap)
    overlayApiRef.current.resize(wrap.clientWidth, wrap.clientHeight)
    return () => ro.disconnect()
  }, [])

  /* 播放时钟 + 渲染循环 */
  useEffect(() => {
    let raf = 0
    let t = 0
    let last = performance.now()

    const loop = (now) => {
      const dt = Math.min(now - last, 100)
      last = now
      const api = apiRef.current
      const overlay = overlayApiRef.current
      if (api && overlay) {
        const { flowing: on, speed: sp } = playRef.current
        if (on) t += dt * sp

        const elements = api.getSceneElements()
        const state = api.getAppState()
        const byId = new Map(elements.map((e) => [e.id, e]))
        const arrows = elements.filter(
          (e) => e.type === 'arrow' && !e.isDeleted && (e.start || e.startBinding) && (e.end || e.endBinding),
        )
        if (import.meta.env.DEV && !window.__flowDebug) {
          window.__flowDebug = {
            arrows: arrows.length,
            total: elements.length,
            sample: arrows[0]
              ? { x: arrows[0].x, y: arrows[0].y, pts: arrows[0].points?.length, color: arrows[0].strokeColor }
              : null,
            zoom: state.zoom?.value,
            scrollX: state.scrollX,
            overlayW: overlayRef.current?.clientWidth,
          }
        }
        overlay.render({ arrows, byId, state, time: t, speed: sp, onArrive: () => {} })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="app">
      <div className="canvas-wrap" ref={wrapRef}>
        <Excalidraw
          excalidrawAPI={onReady}
          theme="dark"
          initialData={{
            elements: initialElements,
            appState: { viewBackgroundColor: '#0d1017' },
          }}
        />
        <canvas ref={overlayRef} className="flow-overlay" />
      </div>

      <div className="control-panel">
        <h1>⚡ FlowPulse <span>· Excalidraw 底座</span></h1>
        <div className="row">
          <button className={flowing ? '' : 'paused'} onClick={() => setFlowing((v) => !v)}>
            {flowing ? '⏸ 暂停流动' : '▶ 恢复流动'}
          </button>
          <span className="speed">{speed.toFixed(1)}x</span>
        </div>
        <div className="row">
          <span>速度</span>
          <input
            type="range" min="0.5" max="3" step="0.5"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </div>
        <p className="hint">编辑器为 Excalidraw 原生：拖拽 / 改大小 / 双击改字 / 撤销重做；数据流动画为外挂 overlay 层</p>
      </div>
    </div>
  )
}
