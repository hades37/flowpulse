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

const CANVAS_BG = { dark: '#0e1117', light: '#f6f7fa' }

export default function App() {
  const apiRef = useRef(null)
  const wrapRef = useRef(null)
  const overlayRef = useRef(null)
  const overlayApiRef = useRef(null)

  const [flowing, setFlowing] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [theme, setTheme] = useState('dark')
  // 播放态走 ref 供 RAF 读取（控制条即时生效）
  const playRef = useRef({ flowing: true, speed: 1 })
  playRef.current = { flowing, speed }

  /* 主题：html[data-theme] 驱动 CSS 变量 + Excalidraw theme/画布底联动 */
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const api = apiRef.current
    if (api) {
      api.updateScene({ appState: { viewBackgroundColor: CANVAS_BG[theme] } })
    }
  }, [theme])

  const onReady = useCallback((api) => {
    apiRef.current = api
    if (import.meta.env.DEV) window.__exApi = api
    // 0.18 无限画布：挂载稳定后把视口对到内容
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
          theme={theme}
          gridModeEnabled
          initialData={{
            elements: initialElements,
            appState: { viewBackgroundColor: CANVAS_BG.dark, gridModeEnabled: true },
          }}
        />
        <canvas ref={overlayRef} className="flow-overlay" />
      </div>

      {/* 右上浮岛：动态控制 + 主题切换（方案 A · 禅意浮岛） */}
      <div className="motion glass">
        <button
          className={`btn${flowing ? ' play' : ''}`}
          title={flowing ? '暂停流动' : '恢复流动'}
          onClick={() => setFlowing((v) => !v)}
        >
          {flowing ? '⏸' : '▶'}
        </button>
        <div className="speed">
          {speed.toFixed(1)}x
          <input
            type="range" min="0.5" max="3" step="0.5"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </div>
        <button
          className="btn"
          title="切换亮/暗主题"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  )
}
