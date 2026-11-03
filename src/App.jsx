import { useCallback, useEffect, useRef, useState } from 'react'
import { CaptureUpdateAction, Excalidraw, newElementWith } from '@excalidraw/excalidraw'

import { createOverlay } from './flow/overlay.js'
import { animationEnabled, withAnimationSetting } from './flow/settings.js'
import { normalizeFlows } from './flow/scenarios.js'
import { usePresenter } from './hooks/usePresenter.js'
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from './templates.js'
import { saveSceneFile, parseSceneFile, persistAutosave, readAutosave, buildShareUrl, decodeShareHash } from './lib/storage.js'
import { exportPNG, exportGIF, exportWebM } from './lib/exporter.js'
import { EdgeContextBar, ShapeContextBar, Toast, Modal, TemplateModal, FlowModal, NameBox, Exporting, Presenter, ToolDock, ZoomIsland, HintIsland } from './components/ui.jsx'
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
  const nameRef = useRef(name)
  nameRef.current = name
  const [flows, setFlows] = useState([])
  const [selectedFlowId, setSelectedFlowId] = useState('')
  const flowsRef = useRef(flows)
  flowsRef.current = flows
  const [toast, setToast] = useState('')
  const [modal, setModal] = useState(null)          // 'template' | null
  const [selArrow, setSelArrow] = useState(null)    // 选中的绑定箭头元素
  const [selShape, setSelShape] = useState(null)    // 选中的形状元素（矩形/菱形/椭圆等）
  const [exporting, setExporting] = useState(null)  // { progress, label }
  const [isViewer] = useState(() => window.location.hash.startsWith('#/v/'))
  const presenter = usePresenter({ apiRef })
  const presenting = presenter.total > 0 && presenter.cursor !== -1
  const [activeTool, setActiveTool] = useState('selection')
  const [effectsOn, setEffectsOn] = useState(true)  // 到达涟漪/徽标开关
  const [zoom, setZoom] = useState(1)
  const effectsRef = useRef(true)
  effectsRef.current = effectsOn

  const playRef = useRef({ flowing: true, speed: 1 })
  playRef.current = { flowing, speed }

  /* Esc 退出演示 */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && presenting) presenter.stop() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, presenter])

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
  const loadElements = useCallback((elements, nextName, captureUpdate = CaptureUpdateAction.IMMEDIATELY) => {
    const api = apiRef.current
    if (!api) return
    api.updateScene({ elements, captureUpdate })
    if (nextName) setName(nextName)
    setTimeout(() => {
      try { const scene = api.getSceneElements(); if (scene.length) api.scrollToContent(scene, { fitToViewport: true, viewportZoomFactor: 0.7 }) }
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
          setFlows(normalizeFlows(shared.flows))
          loadElements(shared.elements, shared.name, CaptureUpdateAction.NEVER)
        } else if (isViewer) {
          showToast('分享链接无效')
        } else {
          const saved = readAutosave()
          setFlows(normalizeFlows(saved?.flows))
          const tpl = TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID) ?? TEMPLATES[0]
          if (saved) loadElements(saved.elements, saved.name, CaptureUpdateAction.NEVER)
          else loadElements(tpl.elements, tpl.name, CaptureUpdateAction.NEVER)
        }
      }
      try { const scene = api.getSceneElements(); if (scene.length) api.scrollToContent(scene, { fitToViewport: true, viewportZoomFactor: 0.75 }) }
      catch { /* ignore */ }
    }, 500)
  }, [isViewer, loadElements, showToast])

  /* ---------- onChange：选中检测 + 自动保存 ---------- */
  const onChange = useCallback((elements, appState) => {
    // 工具激活态 + zoom 跟踪
    setActiveTool(appState.activeTool?.type ?? 'selection')
    setZoom(appState.zoom?.value ?? 1)

    // 唯一选中且为绑定箭头 → 显示配置条；选中形状 → 显示样式条
    const ids = Object.keys(appState.selectedElementIds ?? {})
    let arrow = null
    let shape = null
    if (ids.length === 1) {
      const el = elements.find((e) => e.id === ids[0])
      if (el?.type === 'arrow' && !el.isDeleted && el.startBinding && el.endBinding) arrow = el
      else if (el && ['rectangle', 'diamond', 'ellipse'].includes(el.type) && !el.isDeleted) shape = el
    }
    setSelArrow(arrow)
    setSelShape(shape)

    // 自动保存（去抖，只读/播放不动场景时不触发）
    if (!isViewer && bootedRef.current) {
      clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(() => persistAutosave(elements, nameRef.current, flowsRef.current), 900)
    }
  }, [isViewer, name])

  useEffect(() => {
    if (isViewer || !bootedRef.current || !apiRef.current) return
    clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => persistAutosave(apiRef.current.getSceneElements(), name, flows), 900)
    return () => clearTimeout(autosaveTimer.current)
  }, [isViewer, name, flows])

  /* ---------- 箭头动画参数写回（customData.flowpulse，进撤销栈） ---------- */
  const patchArrow = useCallback((id, patch) => {
    const api = apiRef.current
    if (!api) return
    const els = api.getSceneElements().map((e) =>
      e.id === id
        ? newElementWith(e, { customData: { ...(e.customData ?? {}), flowpulse: { ...(e.customData?.flowpulse ?? {}), ...patch } } })
        : e,
    )
    api.updateScene({ elements: els, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    setSelArrow(els.find((e) => e.id === id))
  }, [])

  const patchArrowColor = useCallback((id, strokeColor) => {
    const api = apiRef.current
    if (!api) return
    const els = api.getSceneElements().map((e) => e.id === id ? newElementWith(e, { strokeColor }) : e)
    api.updateScene({ elements: els, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    setSelArrow(els.find((e) => e.id === id))
  }, [])

  const toggleLineStyle = useCallback((id) => {
    const api = apiRef.current
    if (!api) return
    const els = api.getSceneElements().map((e) => e.id === id ? newElementWith(e, { roundness: e.roundness ? null : { type: 2 } }) : e)
    api.updateScene({ elements: els, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    setSelArrow(els.find((e) => e.id === id))
  }, [])

  const deleteArrow = useCallback((id) => {
    const api = apiRef.current
    if (!api) return
    api.updateScene({ elements: api.getSceneElements().map((e) => e.id === id ? newElementWith(e, { isDeleted: true }) : e), captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    setSelArrow(null)
  }, [])

  /* ---------- 形状样式写回（底部样式条） ---------- */
  const patchShape = useCallback((id, patch) => {
    const api = apiRef.current
    if (!api) return
    const els = api.getSceneElements().map((e) => (e.id === id ? newElementWith(e, patch) : e))
    api.updateScene({ elements: els, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    setSelShape(els.find((e) => e.id === id))
  }, [])

  const patchShapeTextColor = useCallback((id, color) => {
    const api = apiRef.current
    if (!api) return
    const elements = api.getSceneElements()
    const shape = elements.find((e) => e.id === id)
    const textId = shape?.boundElements?.find((item) => item.type === 'text')?.id
    if (!textId) return
    api.updateScene({ elements: elements.map((e) => e.id === textId ? newElementWith(e, { strokeColor: color }) : e), captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    setSelShape({ ...shape })
  }, [])

  const toggleShapeAnimation = useCallback((id) => {
    const api = apiRef.current
    if (!api) return
    const els = api.getSceneElements().map((e) => e.id === id
      ? newElementWith(e, { customData: withAnimationSetting(e, !animationEnabled(e)) })
      : e)
    api.updateScene({ elements: els, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    setSelShape(els.find((e) => e.id === id))
  }, [])

  const deleteShape = useCallback((id) => {
    const api = apiRef.current
    if (!api) return
    api.updateScene({ elements: api.getSceneElements().map((e) => e.id === id ? newElementWith(e, { isDeleted: true }) : e), captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    setSelShape(null)
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
        // 演示态优先（present 非空时 overlay 只画白名单边+光圈+徽标）；
        // effectsOn=false 时到达涟漪与徽标停画（光圈保留）
        const present = presenter.snapshot()
        const p = present && !effectsRef.current ? { ...present, badges: new Map() } : present
        overlay.render({
          arrows, byId, state, time: p?.motionStart != null ? (p.motionPaused ? p.motionElapsed : (now - p.motionStart) * p.motionSpeed) : t, speed: sp, onArrive: () => {},
          present: p, effectsOn: effectsRef.current,
        })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  /* ---------- 工具 / 视口控制 ---------- */
  const doTool = useCallback((type) => {
    apiRef.current?.setActiveTool({ type })
  }, [])

  const doZoom = useCallback((delta) => {
    const api = apiRef.current
    if (!api) return
    const z = Math.min(8, Math.max(0.1, (api.getAppState().zoom?.value ?? 1) + delta))
    api.updateScene({ appState: { zoom: { value: z } } })
  }, [])

  const doFit = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    try { const scene = api.getSceneElements(); if (scene.length) api.scrollToContent(scene, { fitToViewport: true, viewportZoomFactor: 0.85 }) }
    catch { /* ignore */ }
  }, [])

  const startPresentation = (flow = flows.find((f) => f.id === selectedFlowId)) => {
    setFlowing(true)
    const result = presenter.play({ speed, flow })
    if (result?.error) return result.error
    return ''
  }

  /* ---------- 文件操作 ---------- */
  const doNew = (saveCurrent = false) => {
    const api = apiRef.current
    if (!api) return
    if (saveCurrent) saveSceneFile(api.getSceneElements(), name, flows)
    presenter.stop()
    clearTimeout(autosaveTimer.current)
    flowsRef.current = []
    nameRef.current = '未命名图'
    setFlows([]); setSelectedFlowId(''); setName('未命名图')
    setSelArrow(null); setSelShape(null)
    api.updateScene({ elements: [], appState: { selectedElementIds: {}, scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewBackgroundColor: CANVAS_BG[theme] }, captureUpdate: CaptureUpdateAction.NEVER })
    api.history.clear()
    api.setActiveTool({ type: 'selection' })
    clearTimeout(autosaveTimer.current)
    persistAutosave([], '未命名图', [])
    setModal(null)
    showToast('已新建空白画布')
  }

  const doSave = () => {
    saveSceneFile(apiRef.current.getSceneElements(), name, flows)
    showToast('已保存工程 JSON')
  }

  const doOpen = (ev) => {
    const f = ev.target.files?.[0]
    if (!f) return
    f.text().then((txt) => {
      try {
        const r = parseSceneFile(txt)
        setFlows(normalizeFlows(r.flows)); setSelectedFlowId(''); presenter.stop()
        loadElements(r.elements, r.name)
        showToast(`已打开「${r.name}」`)
      } catch (e) { showToast(e.message) }
    })
    ev.target.value = ''
  }

  const doShare = async () => {
    const url = buildShareUrl(apiRef.current.getSceneElements(), name, flows)
    if (import.meta.env.DEV) window.__shareUrl = url
    try {
      if (!navigator.clipboard?.writeText) throw new Error('剪贴板不可用')
      await navigator.clipboard.writeText(url)
      showToast('分享链接已复制（只读互动页）')
    } catch {
      window.prompt('无法自动复制，请手动复制分享链接：', url)
    }
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
          gridModeEnabled={false}
          initialData={{ appState: { viewBackgroundColor: CANVAS_BG.dark, gridModeEnabled: false } }}
        />
        <canvas ref={overlayRef} className="flow-overlay" />
      </div>

      {/* 顶部中央：工具 dock（设计稿形态） */}
      {!isViewer && (
        <ToolDock activeTool={activeTool} onTool={doTool} onLibrary={() => setModal('template')} />
      )}

      {/* 左上：brand（窄条：logo + 文件名） */}
      <div className="brand glass">
        <span className="logo">⚡Flow<em>Pulse</em></span>
        {isViewer
          ? <span className="file-ro">只读分享页</span>
          : <NameBox name={name} onChange={setName} />}
      </div>

      {/* 右侧：竖排功能 dock（编辑模式：文件/分享/演示/导出） */}
      {!isViewer && (
        <div className="dock glass">
          <button className="d-btn" title="新建画布" aria-label="新建画布" onClick={() => setModal('new')}>＋</button>
          <button className="d-btn" title="模板中心" onClick={() => setModal('template')}>◈</button>
          <button className="d-btn" title="打开工程" onClick={() => document.getElementById('openFile')?.click()}>📂</button>
          <button className="d-btn" title="保存工程" onClick={doSave}>💾</button>
          <div className="d-sep" />
          <button className="d-btn hero" title="复制分享链接" onClick={doShare}>✦</button>
          <button className="d-btn demo" title="讲解流程" onClick={() => setModal('flow')}>▶</button>
          <div className="d-sep" />
          <button className="d-btn" title="导出 PNG" onClick={() => exportPNG({ api: apiRef.current, fileName: name }).then(() => showToast('PNG 已导出')).catch((e) => showToast(e.message))}>PNG</button>
          <button className="d-btn" title="导出 GIF 动图" onClick={() => runExport('gif')}>GIF</button>
          <button className="d-btn" title="导出 WebM 视频" onClick={() => runExport('webm')}>WVM</button>
        </div>
      )}

      {/* 右上：动态控制 + 主题 */}
      <div className="motion glass">
        {isViewer && (
          <button className="btn play" title="播放演示"
            onClick={() => setModal('flow')}>▶</button>
        )}
        <button className={`btn${flowing ? ' play' : ''}`} disabled={presenter.playing} title={presenter.playing ? '演示播放期间不可暂停流动' : flowing ? '暂停流动' : '恢复流动'}
          onClick={() => setFlowing((v) => !v)}>{flowing ? '⏸' : '▶'}</button>
        <div className="speed">{speed.toFixed(1)}x
          <input type="range" min="0.5" max="3" step="0.5" value={speed} disabled={presenter.playing}
            onChange={(e) => setSpeed(Number(e.target.value))} />
        </div>
        <button className={`btn${effectsOn ? ' fx-on' : ''}`} title={`到达联动：${effectsOn ? '开' : '关'}（涟漪与徽标）`}
          onClick={() => setEffectsOn((v) => !v)}>{effectsOn ? '◉' : '○'}</button>
        <button className="btn" title="切换亮/暗主题"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {/* 左下 zoom / 右下 hint（设计稿浮岛） */}
      <ZoomIsland zoom={zoom} onZoom={doZoom} onFit={doFit} />
      <HintIsland />

      {/* 演示播放器 */}
      {presenting && (
        <Presenter
          cursor={presenter.cursor} total={presenter.total} playing={presenter.playing}
          description={presenter.description} flowName={presenter.flowName}
          onReplay={() => startPresentation()}
          onMove={presenter.move} onToggle={presenter.toggle}
          onStop={presenter.stop}
        />
      )}

      {/* 底部中央：选中箭头配置条 / 选中形状样式条 */}
      {selArrow && !isViewer && (
        <EdgeContextBar
          arrow={selArrow}
          byId={new Map(apiRef.current.getSceneElements().map((e) => [e.id, e]))}
          onPatch={(p) => patchArrow(selArrow.id, p)}
          onColor={(color) => patchArrowColor(selArrow.id, color)}
          onLineStyle={() => toggleLineStyle(selArrow.id)}
          onDelete={() => deleteArrow(selArrow.id)}
        />
      )}
      {!selArrow && selShape && !isViewer && (
        <ShapeContextBar
          shape={selShape}
          byId={new Map(apiRef.current.getSceneElements().map((e) => [e.id, e]))}
          onPatch={(p) => patchShape(selShape.id, p)}
          onTextColor={(color) => patchShapeTextColor(selShape.id, color)}
          onToggleAnimation={() => toggleShapeAnimation(selShape.id)}
          onDelete={() => deleteShape(selShape.id)}
        />
      )}

      {modal === 'template' && (
        <TemplateModal
          templates={TEMPLATES}
          onClose={() => setModal(null)}
          onUse={(t) => { setFlows([]); setSelectedFlowId(''); presenter.stop(); loadElements(t.elements, t.name); setModal(null); showToast(`已应用「${t.name}」`) }}
        />
      )}

      {modal === 'new' && <Modal title="新建画布" onClose={() => setModal(null)} width={440}>
        <p className="new-scene-hint">新建画布会替换当前浏览器中的自动保存。需要保留当前图时，请先保存工程。</p>
        <div className="new-scene-actions">
          <button className="ctx-act" onClick={() => setModal(null)}>取消</button>
          <button className="ctx-act" onClick={() => doNew(false)}>直接新建</button>
          <button className="ctx-act active" onClick={() => doNew(true)}>保存工程并新建</button>
        </div>
      </Modal>}

      {modal === 'flow' && apiRef.current && <FlowModal flows={flows} selectedId={selectedFlowId} onSelect={setSelectedFlowId} onChange={setFlows} elements={apiRef.current.getSceneElements()} readOnly={isViewer} onClose={() => setModal(null)} onPlay={(flow) => { const error = startPresentation(flow); if (!error) setModal(null); return error }} />}

      <Toast msg={toast} />
      {exporting && <Exporting progress={exporting.progress} label={exporting.label} />}
      <input id="openFile" type="file" accept=".json" hidden onChange={doOpen} />
    </div>
  )
}
