import { useEffect, useState } from 'react'

/* ========== 小 UI 组件集合（方案 A 浮岛体系） ========== */

/** 底部中央：选中箭头的动画配置条 */
export function EdgeContextBar({ arrow, byId, onPatch, onDelete }) {
  const fp = arrow.customData?.flowpulse ?? {}
  const packets = Math.max(1, fp.packets ?? 2)
  const durationMs = fp.durationMs ?? 2200

  const src = byId.get(arrow.startBinding?.elementId ?? '')
  const dst = byId.get(arrow.endBinding?.elementId ?? '')
  const srcLabel = src?.id ? labelOf(src) : '起点'
  const dstLabel = dst?.id ? labelOf(dst) : '终点'

  const COLORS = ['#6ea8ff', '#57d68f', '#ffb454', '#ff7a7a', '#b28cff']

  return (
    <div className="ctx glass">
      <span className="ctx-name">⚡ {srcLabel} → {dstLabel}</span>
      <div className="swatches">
        {COLORS.map((c) => (
          <i key={c} className={arrow.strokeColor === c ? 'on' : ''} style={{ background: c }} />
        ))}
      </div>
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

function labelOf(el) {
  // container 的显示文本在其绑定的 text 元素上（boundElements）
  return el.name || el.text || el.id?.slice(0, 6) || '?'
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
