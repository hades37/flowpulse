import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 演示模式驱动器（excalidraw 分支版）：
 * 一键按图生成脚本（每条绑定箭头 = 一步：单边流动 → 目标高亮+成功徽标），
 * 串行自动播放；glows/badges 持续叠加到结束；重播/前进/退出恢复。
 *
 * present 状态结构（传入 overlay.render）：
 *   { activeIds: Set|null, glows: Map, badges: Map }
 */

export function usePresenter({ apiRef }) {
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const [total, setTotal] = useState(0)
  const presentRef = useRef(null) // 最新演示态（RAF 每帧读）
  const timerRef = useRef(null)
  const api = () => apiRef.current

  const clearTimer = () => { clearTimeout(timerRef.current); timerRef.current = null }

  /** 演示态快照（供 overlay） */
  const snapshot = () => presentRef.current

  const stop = useCallback(() => {
    clearTimer()
    presentRef.current = null
    setPlaying(false)
    setCursor(-1)
  }, [])

  /**
   * 播放：从头自动推进
   * @param opts { speed, onDone }
   */
  const play = useCallback((opts = {}) => {
    clearTimer()
    const a = api()
    if (!a) return
    const arrows = a.getSceneElements().filter(
      (e) => e.type === 'arrow' && !e.isDeleted && (e.startBinding || e.start) && (e.endBinding || e.end),
    )
    if (arrows.length === 0) return
    const byId = new Map(a.getSceneElements().map((e) => [e.id, e]))
    setTotal(arrows.length)
    setPlaying(true)

    const glows = new Map()
    const badges = new Map()
    let i = 0

    const step = () => {
      if (i >= arrows.length) {
        presentRef.current = { activeIds: null, glows, badges }
        setCursor(arrows.length)
        setPlaying(false)
        opts.onDone?.()
        return
      }
      const edge = arrows[i]
      const fp = edge.customData?.flowpulse ?? {}
      const durMs = (fp.durationMs ?? 2200) / (opts.speed ?? 1)
      const color = edge.strokeColor || '#6ea8ff'
      const srcId = edge.startBinding?.elementId ?? edge.start?.id
      const dstId = edge.endBinding?.elementId ?? edge.end?.id

      // 步骤开始：只激活这条边 + 高亮源
      glows.set(srcId, color)
      badges.set(srcId, { kind: 'active', color })
      presentRef.current = { activeIds: new Set([edge.id]), glows, badges }
      setCursor(i + 1)

      // 步骤结束：目标高亮 + 成功徽标，短暂间隔进下一步
      timerRef.current = setTimeout(() => {
        glows.set(dstId, color)
        badges.set(dstId, { kind: 'success', color })
        i += 1
        timerRef.current = setTimeout(step, 420)
      }, durMs)
    }
    step()
  }, [])

  return { playing, cursor, total, play, stop, snapshot }
}
