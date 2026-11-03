import { useEffect, useState } from 'react'
import { animationEnabled } from '../flow/settings.js'
import { availableArrows, makeDefaultSteps } from '../flow/scenarios.js'

/* ========== 小 UI 组件集合（方案 A 浮岛体系） ========== */

function hexColor(value, fallback = '#6ea8ff') {
  if (/^#[0-9a-f]{6}$/i.test(value || '')) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value || '')) return `#${[...value.slice(1)].map((c) => c + c).join('')}`.toLowerCase()
  return fallback
}

function ColorPicker({ label, value, onChange, fallback }) {
  const color = hexColor(value, fallback)
  const [draft, setDraft] = useState(color)
  useEffect(() => setDraft(color), [color])
  const commit = () => {
    const input = draft.trim()
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) onChange(hexColor(input))
    else setDraft(color)
  }
  return (
    <div className="color-picker">
      <label className="color-picker-label" title={`${label}：打开颜色选择器`}>
        <span>{label}</span>
        <input aria-label={`${label}颜色选择器`} type="color" value={color} onChange={(e) => onChange(e.target.value)} />
      </label>
      <input className="color-hex" aria-label={`${label}颜色值`} title="输入十六进制颜色，例如 #12aabb" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} spellCheck={false} />
    </div>
  )
}

/** 底部中央：选中箭头的动画配置条 */
export function EdgeContextBar({ arrow, byId, onPatch, onColor, onLineStyle, onDelete }) {  const fp = arrow.customData?.flowpulse ?? {}
  const packets = Math.max(1, fp.packets ?? 2)
  const durationMs = fp.durationMs ?? 2200

  const src = byId.get(arrow.startBinding?.elementId ?? '')
  const dst = byId.get(arrow.endBinding?.elementId ?? '')
  const srcLabel = src?.id ? labelOf(src, byId) : '起点'
  const dstLabel = dst?.id ? labelOf(dst, byId) : '终点'

  const COLORS = ['#6ea8ff', '#57d68f', '#ffb454', '#ff7a7a', '#b28cff']

  return (
    <div className="ctx glass">
      <span className="ctx-name">⚡ {srcLabel} → {dstLabel}</span>
      <button className={`ctx-act${animationEnabled(arrow) ? ' active' : ''}`} aria-pressed={animationEnabled(arrow)} title="只控制这条连线的数据包动画" onClick={() => onPatch({ animationEnabled: !animationEnabled(arrow) })}>
        数据流 {animationEnabled(arrow) ? '开' : '关'}
      </button>
      <div className="ctx-sep" />
      {!arrow.elbowed && <button className="ctx-act" title="切换直线或曲线" onClick={onLineStyle}>{arrow.roundness ? '曲线' : '直线'}</button>}
      <div className="swatches">
        {COLORS.map((c) => (
          <button key={c} type="button" aria-label={`连线颜色 ${c}`} className={arrow.strokeColor === c ? 'on' : ''} style={{ background: c }} onClick={() => onColor(c)} />
        ))}
      </div>
      <ColorPicker key={arrow.id} label="连线" value={arrow.strokeColor} onChange={onColor} />
      <div className="ctx-sep" />
      <div className="stepper">
        {[1, 2, 3].map((n) => (
          <button key={n} className={packets === n ? 'on' : ''} onClick={() => onPatch({ packets: n })}>{n}</button>
        ))}
      </div>
      <div className="ctx-sep" />
      <input
        className="ctx-range" type="range" min="800" max="3400" step="200"
        value={durationMs} title={`流速 ${(durationMs / 1000).toFixed(1)}s/包`}
        onChange={(e) => onPatch({ durationMs: Number(e.target.value) })}
      />
      <span className="ctx-speed">{(durationMs / 1000).toFixed(1)}s</span>
      <div className="ctx-sep" />
      <button className="ctx-act danger" onClick={onDelete} title="删除连线">🗑</button>
    </div>
  )
}

function labelOf(el, byId) {
  // container 的显示文本在其绑定的 text 元素上（boundElements）
  const text = el.boundElements?.find((item) => item.type === 'text')
  return (text && byId.get(text.id)?.text) || el.name || el.text || el.id?.slice(0, 6) || '?'
}

/** Toast */
export function Toast({ msg }) {
  if (!msg) return null
  return <div className="toast glass">{msg}</div>
}

/** 简单弹层（模板中心等） */
export function Modal({ title, onClose, children, width = 720 }) {
  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal glass" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><span>{title}</span><button className="modal-close" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  )
}

/** 模板中心 */
export function TemplateModal({ templates, onUse, onClose }) {
  return (
    <Modal title="模板中心" onClose={onClose} width={820}>
      <div className="tpl-grid">
        {templates.map((t) => (
          <div key={t.id} className="tpl-card" onClick={() => onUse(t)}>
            <div className="tpl-name">{t.name}</div>
            <div className="tpl-desc">{t.desc}</div>
            <div className="tpl-meta">{t.elements.filter(e => e.type !== 'text' && e.type !== 'arrow').length} 形状 · {t.elements.filter(e => e.type === 'arrow').length} 数据流</div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

/** 文件名行内编辑 */
export function NameBox({ name, onChange }) {
  return (
    <input className="file-name" value={name} spellCheck={false} title="点击修改名称" onChange={(e) => onChange(e.target.value)} />
  )
}

/** 导出进度小浮层 */
export function Exporting({ progress, label }) {
  return (
    <div className="exporting glass">
      <div className="rec-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <span>{label} {Math.round(progress * 100)}%</span>
    </div>
  )
}

/** 演示播放器（底部中央） */
export function Presenter({ cursor, total, playing, description, flowName, onReplay, onStop, onMove, onToggle }) {
  return (
    <div className="presenter glass">
      <button className="p-btn" onClick={onReplay} title="重播">↺</button>
      <button className="p-btn" onClick={() => onMove(-1)} disabled={cursor <= 1} title="上一步">‹</button>
      <button className="p-btn" onClick={onToggle} title={playing ? '暂停演示' : '继续演示'}>{playing ? 'Ⅱ' : '▶'}</button>
      <button className="p-btn" onClick={() => onMove(1)} disabled={cursor >= total} title="下一步">›</button>
      <div className="p-prog">
        <i style={{ width: `${total ? (cursor / total) * 100 : 0}%` }} />
      </div>
      <span className="p-label">{flowName} · {Math.max(cursor, 0)} / {total}{description ? ` · ${description}` : ''}</span>
      <button className="p-btn danger" onClick={onStop} title="退出演示 (Esc)">✕</button>
    </div>
  )
}

export function FlowModal({ flows, selectedId, onSelect, onChange, elements, onPlay, onClose, readOnly = false }) {
  const [error, setError] = useState('')
  const arrows = availableArrows(elements)
  const byId = new Map(elements.map((el) => [el.id, el]))
  const label = (edge) => {
    const from = byId.get(edge.startBinding?.elementId ?? edge.start?.id)
    const to = byId.get(edge.endBinding?.elementId ?? edge.end?.id)
    return `${from ? labelOf(from, byId) : '起点'} → ${to ? labelOf(to, byId) : '终点'}`
  }
  const flow = flows.find((f) => f.id === selectedId)
  const update = (patch) => onChange(flows.map((f) => f.id === flow.id ? { ...f, ...patch } : f))
  const updateStep = (index, patch) => update({ steps: flow.steps.map((step, i) => i === index ? { ...step, ...patch } : step) })
  const newFlow = () => {
    const id = globalThis.crypto.randomUUID()
    onChange([...flows, { id, name: `流程 ${flows.length + 1}`, steps: makeDefaultSteps(elements) }])
    onSelect(id)
  }
  return (
    <Modal title="讲解流程" onClose={onClose} width={740}>
      <div className="flow-toolbar">
        <label>选择流程 <select aria-label="选择流程" value={flow?.id ?? ''} onChange={(e) => onSelect(e.target.value)}><option value="">自动演示（按连线顺序）</option>{flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        {!readOnly && <button className="ctx-act" onClick={newFlow}>＋ 新建流程</button>}
        <button className="ctx-act active" onClick={() => setError(onPlay(flow) || '')}>▶ 播放</button>
      </div>
      {error && <p className="flow-error" role="alert">{error}</p>}
      {!flow ? <p className="flow-hint">自动演示按画布中连线的顺序播放。新建流程后可以编辑步骤和说明。</p> : <>
        {!readOnly && <div className="flow-toolbar"><label>流程名称 <input aria-label="流程名称" value={flow.name} onChange={(e) => update({ name: e.target.value })} /></label><button className="ctx-act danger" onClick={() => { onChange(flows.filter((f) => f.id !== flow.id)); onSelect('') }}>删除流程</button></div>}
        <div className="flow-steps">
          {flow.steps.map((step, index) => <div className="flow-step" key={index}>
            <span>{index + 1}</span>
            <select aria-label={`第${index + 1}步连线`} value={step.edgeId} disabled={readOnly} onChange={(e) => updateStep(index, { edgeId: e.target.value })}>
              {!arrows.some((a) => a.id === step.edgeId) && <option value={step.edgeId}>连线已删除或解绑，请重新选择</option>}
              {arrows.map((a) => <option value={a.id} key={a.id}>{label(a)}</option>)}
            </select>
            <input aria-label={`第${index + 1}步说明`} placeholder="步骤说明（可选）" value={step.description} disabled={readOnly} onChange={(e) => updateStep(index, { description: e.target.value })} />
            {!readOnly && <><button className="ctx-act" disabled={index === 0} title="上移" onClick={() => { const steps = [...flow.steps]; [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; update({ steps }) }}>↑</button><button className="ctx-act" disabled={index === flow.steps.length - 1} title="下移" onClick={() => { const steps = [...flow.steps]; [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]]; update({ steps }) }}>↓</button><button className="ctx-act danger" title="删除步骤" onClick={() => update({ steps: flow.steps.filter((_, i) => i !== index) })}>×</button></>}
          </div>)}
        </div>
        {!readOnly && <button className="ctx-act" disabled={!arrows.length} onClick={() => update({ steps: [...flow.steps, { edgeId: arrows[0].id, description: '' }] })}>＋ 添加步骤</button>}
      </>}
    </Modal>
  )
}

/** 顶部中央工具 dock（设计稿形态，驱动 Excalidraw setActiveTool） */
export function ToolDock({ activeTool, onTool, onLibrary }) {
  const TOOLS = [
    { id: 'selection', icon: '➚', title: '选择' },
    { id: 'hand', icon: '✋', title: '手型平移' },
    null,
    { id: 'rectangle', icon: '▭', title: '矩形' },
    { id: 'diamond', icon: '◇', title: '菱形' },
    { id: 'ellipse', icon: '◯', title: '椭圆' },
    { id: 'arrow', icon: '↗', title: '箭头（连线）' },
    { id: 'text', icon: 'T', title: '文字' },
    null,
    { id: 'library', icon: '☰', title: '模板中心' },
  ]
  return (
    <div className="tooldock glass">
      {TOOLS.map((t, i) =>
        t === null
          ? <div key={i} className="d-sep-v" />
          : (
            <button
              key={t.id}
              className={`t-btn${activeTool === t.id ? ' on' : ''}`}
              title={t.title}
              onClick={() => (t.id === 'library' ? onLibrary() : onTool(t.id))}
            >
              {t.icon}
            </button>
          ),
      )}
    </div>
  )
}

/** 左下 zoom 浮岛 */
export function ZoomIsland({ zoom, onZoom, onFit }) {
  return (
    <div className="zoomisland glass">
      <button onClick={() => onZoom(-0.1)} title="缩小">−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={() => onZoom(0.1)} title="放大">＋</button>
      <button onClick={onFit} title="适应内容">⛶</button>
    </div>
  )
}

/** 右下快捷键提示浮岛 */
export function HintIsland() {
  return (
    <div className="hintisland glass">双击改字 · 拖角调大小 · 空格拖动画布</div>
  )
}

/** 底部中央：选中形状的样式条（设计稿形态：颜色/填充/线宽/删除） */
export function ShapeContextBar({ shape, byId, onPatch, onTextColor, onToggleAnimation, onDelete }) {
  const COLORS = ['#6ea8ff', '#57d68f', '#ffb454', '#ff7a7a', '#b28cff', '#e8ecf4', '#566074']
  const filled = shape.backgroundColor && shape.backgroundColor !== 'transparent'
  const sw = shape.strokeWidth ?? 2
  const boundText = byId.get(shape.boundElements?.find((item) => item.type === 'text')?.id)
  return (
    <div className="ctx glass">
      <span className="ctx-name">▢ {labelOf(shape, byId)}</span>
      <button className={`ctx-act${animationEnabled(shape) ? ' active' : ''}`} aria-pressed={animationEnabled(shape)} title="只控制此节点的涟漪、演示高亮和徽标" onClick={onToggleAnimation}>
        节点动画 {animationEnabled(shape) ? '开' : '关'}
      </button>
      <div className="ctx-sep" />
      <div className="swatches">
        {COLORS.map((c) => (
          <button key={c} type="button" aria-label={`边框颜色 ${c}`} className={shape.strokeColor === c ? 'on' : ''} style={{ background: c }}
            onClick={() => onPatch({ strokeColor: c })} />
        ))}
      </div>
      <ColorPicker key={`${shape.id}-stroke`} label="边框" value={shape.strokeColor} onChange={(strokeColor) => onPatch({ strokeColor })} />
      <ColorPicker key={`${shape.id}-fill`} label="填充" value={filled ? shape.backgroundColor : shape.strokeColor} onChange={(backgroundColor) => onPatch({ backgroundColor, fillStyle: 'solid' })} />
      {boundText && <ColorPicker key={`${shape.id}-text`} label="文字" value={boundText.strokeColor} fallback="#e8ecf4" onChange={onTextColor} />}
      <div className="ctx-sep" />
      <div className="stepper">
        {[1, 2, 4].map((w) => (
          <button key={w} className={sw === w ? 'on' : ''} title={`${w}px 线宽`}
            onClick={() => onPatch({ strokeWidth: w })}>{w}</button>
        ))}
      </div>
      <div className="ctx-sep" />
      <button className="ctx-act" onClick={() => onPatch({ backgroundColor: filled ? 'transparent' : (shape.strokeColor ?? '#6ea8ff'), fillStyle: 'solid' })}>
        {filled ? '无填充' : '填充'}
      </button>
      <div className="ctx-sep" />
      <button className="ctx-act danger" onClick={onDelete} title="删除">🗑</button>
    </div>
  )
}
