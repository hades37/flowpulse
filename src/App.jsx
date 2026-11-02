import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'

import { createOverlay } from './flow/overlay.js'
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from './templates.js'
import { saveSceneFile, parseSceneFile, persistAutosave, readAutosave, buildShareUrl, decodeShareHash } from './lib/storage.js'
import { exportPNG, exportGIF, exportWebM } from './lib/exporter.js'
import { EdgeContextBar, Toast, TemplateModal, NameBox, Exporting } from './components/ui.jsx'
import './styles.css'

const CANVAS_BG = { dark: '#0e1117', light: '#f6f7fa' }

export default function App() {
  const apiRef = useRef(null)
  const wrapRef = useRef(null)
  const overlayRef = useRef(null)
  const overlayApiRef = useRef(null)
  const bootedRef = useRef(false)
  const autosaveTimer = useRef(0)

  const [flowing, setFlowing] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [theme, setTheme] = useState('dark')
  const [name, setName] = useState('未命名图')
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState(null)          // 'template' | null
  const [selArrow, setSelArrow] = useState(null)    // 选中的绑定箭头元素
  const [exporting, setExporting] = useState(null)  // { progress, label }
  const [isViewer] = useState(() => window.location.hash.startsWith('#/v/'))

  const playRef = useRef({ flowing: true, speed: 1 })
  playRef.current = { flowing, speed }

  const showToast = useCallback((m) => {
    setToast(m)
    setTimeout(() => setToast(''), 1800)
  }, [])

  /* ---------- 主题：CSS 变量 + Excalidraw theme + 画布底 三方联动 ---------- */
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    apiRef.current?.updateScene({ appState: { viewBackgroundColor: CANVAS_BG[theme] } })
  }, [theme])

  /* ---------- 场景写入帮助 ---------- */
  const loadElements = useCallback((elements, nextName) => {
    const api = apiRef.current
    if (!api) return
    api.updateScene({ elements })
    if (nextName) setName(nextName)
    setTimeout(() => {
      try { api.scrollToContent(api.getSceneElements(), { fitToViewport: true, viewportZoomFactor: 0.7 }) }
      catch { /* ignore */ }
    }, 400)
  }, [])

  const onReady = useCallback((api) => {
    apiRef.current = api
    if (import.meta.env.DEV) window.__exApi = api

    // 0.18：excalidrawAPI 回调早于挂载完成，直接 updateScene 是 no-op —— 延迟到稳定后
    setTimeout(() => {
      if (!bootedRef.current) {
        bootedRef.current = true
        const shared = decodeShareHash(window.location.hash)
        if (shared && isViewer) {
          loadElements(shared.elements, shared.name)
        } else if (isViewer) {
          showToast('分享链接无效')
        } else {
          const saved = readAutosave()
          const tpl = TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID) ?? TEMPLATES[0]
          if (saved && saved.elements?.length) loadElements(saved.elements, saved.name)
          else loadElements(tpl.elements, tpl.name)
        }
      }
      try { api.scrollToContent(api.getSceneElements(), { fitToViewport: true, viewportZoomFactor: 0.75 }) }
      catch { /* ignore */ }
    }, 500)
  }, [isViewer, loadElements, showToast])

  /* ---------- onChange：选中检测 + 自动保存 ---------- */
  const onChange = useCallback((elements, appState) => {
    // 唯一选中且为绑定箭头 → 显示配置条
    const ids = Object.keys(appState.selectedElementIds ?? {})
    let arrow = null
    if (ids.length === 1) {
      const el = elements.find((e) => e.id === ids[0])
      if (el?.type === 'arrow' && !el.isDeleted && el.startBinding && el.endBinding) arrow = el
    }
    setSelArrow(arrow)

    // 自动保存（去抖，只读/播放不动场景时不触发）
    if (!isViewer) {
      clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(() => persistAutosave(elements, name), 900)
    }
  }, [isViewer, name])

  /* ---------- 箭头动画参数写回（customData.flowpulse，进撤销栈） ---------- */
  const patchArrow = useCallback((id, patch) => {
    const api = apiRef.current
    if (!api) return
    const els = api.getSceneElements().map((e) =>
      e.id === id
        ? { ...e, customData: { ...(e.customData ?? {}), flowpulse: { ...(e.customData?.flowpulse ?? {}), ...patch } } }
        : e,
    )
    api.updateScene({ elements: els })
    setSelArrow(els.find((e) => e.id === id))
  }, [])

  const deleteArrow = useCallback((id) => {
    const api = apiRef.current
    if (!api) return
    api.updateScene({ elements: api.getSceneElements().filter((e) => e.id !== id) })
    setSelArrow(null)
  }, [])

  /* ---------- overlay 尺寸 + 渲染循环 ---------- */
  useEffect(() => {
    const canvas = overlayRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    overlayApiRef.current = createOverlay(canvas)
    const ro = new ResizeObserver(() => overlayApiRef.current?.resize(wrap.clientWidth, wrap.clientHeight))
    ro.observe(wrap)
    overlayApiRef.current.resize(wrap.clientWidth, wrap.clientHeight)
    return () => ro.disconnect()
  }, [])

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
          (e) => e.type === 'arrow' && !e.isDeleted && (e.startBinding || e.start) && (e.endBinding || e.end),
        )
        overlay.render({ arrows, byId, state, time: t, speed: sp, onArrive: () => {} })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* ---------- 文件操作 ---------- */
  const doSave = () => {
    saveSceneFile(apiRef.current.getSceneElements(), name)
    showToast('已保存工程 JSON')
  }

  const doOpen = (ev) => {
    const f = ev.target.files?.[0]
    if (!f) return
    f.text().then((txt) => {
      try {
        const r = parseSceneFile(txt)
        loadElements(r.elements, r.name)
        showToast(`已打开「${r.name}」`)
      } catch (e) { showToast(e.message) }
    })
    ev.target.value = ''
  }

  const doShare = () => {
    const url = buildShareUrl(apiRef.current.getSceneElements(), name)
    if (import.meta.env.DEV) window.__shareUrl = url
    navigator.clipboard?.writeText(url).catch(() => {})
    showToast('分享链接已复制（只读互动页）')
  }

  const runExport = async (kind) => {
    const api = apiRef.current
    setExporting({ progress: 0, label: kind === 'gif' ? 'GIF 合成' : 'WebM 录制' })
    try {
      const opts = { api, fileName: name, onProgress: (p) => setExporting({ progress: p, label: kind === 'gif' ? 'GIF 合成' : 'WebM 录制' }) }
      if (kind === 'gif') await exportGIF({ ...opts, overlayCanvas: overlayRef.current, duration: 4, fps: 12 })
      else await exportWebM({ ...opts, overlayCanvas: overlayRef.current, duration: 4 })
      showToast(`${kind.toUpperCase()} 已导出`)
    } catch (e) { showToast(`导出失败：${e.message}`) }
    setExporting(null)
  }

  return (
    <div className="app">
      <div className="canvas-wrap" ref={wrapRef}>
        <Excalidraw
          excalidrawAPI={onReady}
          onChange={onChange}
          theme={theme}
          viewModeEnabled={isViewer}
          gridModeEnabled
          initialData={{ appState: { viewBackgroundColor: CANVAS_BG.dark, gridModeEnabled: true } }}
        />
        <canvas ref={overlayRef} className="flow-overlay" />
      </div>

      {/* 左上：brand + 文件 + 文件操作（编辑模式） */}
      <div className="brand glass">
        <span className="logo">⚡Flow<em>Pulse</em></span>
        {isViewer
          ? <span className="file-ro">只读分享页</span>
          : <>
              <NameBox name={name} onChange={setName} />
              <div className="ctx-sep" />
              <button className="b-act" onClick={() => setModal('template')}>模板</button>
              <button className="b-act" onClick={() => document.getElementById('openFile')?.click()}>打开</button>
              <button className="b-act" onClick={doSave}>保存</button>
            </>}
      </div>

      {/* 右上：动态控制 + 主题 */}
      <div className="motion glass">
        <button className={`btn${flowing ? ' play' : ''}`} title={flowing ? '暂停流动' : '恢复流动'}
          onClick={() => setFlowing((v) => !v)}>{flowing ? '⏸' : '▶'}</button>
        <div className="speed">{speed.toFixed(1)}x
          <input type="range" min="0.5" max="3" step="0.5" value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))} />
        </div>
        <button className="btn" title="切换亮/暗主题"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {/* 右上下方：导出/分享（编辑模式） */}
      {!isViewer && (
        <div className="exports glass">
          <button className="b-act hero" onClick={doShare}>分享 ✦</button>
          <div className="ctx-sep" />
          <button className="b-act" onClick={() => exportPNG({ api: apiRef.current, fileName: name }).then(() => showToast('PNG 已导出')).catch((e) => showToast(e.message))}>PNG</button>
          <button className="b-act" onClick={() => runExport('gif')}>GIF</button>
          <button className="b-act" onClick={() => runExport('webm')}>WebM</button>
        </div>
      )}

      {/* 底部中央：选中箭头配置条 */}
      {selArrow && !isViewer && (
        <EdgeContextBar
          arrow={selArrow}
          byId={new Map(apiRef.current.getSceneElements().map((e) => [e.id, e]))}
          onPatch={(p) => patchArrow(selArrow.id, p)}
          onDelete={() => deleteArrow(selArrow.id)}
        />
      )}

      {modal === 'template' && (
        <TemplateModal
          templates={TEMPLATES}
          onClose={() => setModal(null)}
          onUse={(t) => { loadElements(t.elements, t.name); setModal(null); showToast(`已应用「${t.name}」`) }}
        />
      )}

      <Toast msg={toast} />
      {exporting && <Exporting progress={exporting.progress} label={exporting.label} />}
      <input id="openFile" type="file" accept=".json" hidden onChange={doOpen} />
    </div>
  )
}
