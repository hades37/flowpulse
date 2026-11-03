import { useCallback, useEffect, useRef, useState } from 'react'
import { makeDefaultSteps, resolveSteps } from '../flow/scenarios.js'

export function usePresenter({ apiRef }) {
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const [total, setTotal] = useState(0)
  const [description, setDescription] = useState('')
  const [flowName, setFlowName] = useState('')
  const presentRef = useRef(null)
  const timerRef = useRef(null)
  const stepsRef = useRef([])
  const speedRef = useRef(1)
  const indexRef = useRef(-1)
  const playingRef = useRef(false)
  const clear = () => { clearTimeout(timerRef.current); timerRef.current = null }
  useEffect(() => () => clearTimeout(timerRef.current), [])
  const stop = useCallback(() => {
    clear(); playingRef.current = false; presentRef.current = null
    setPlaying(false); setCursor(-1); indexRef.current = -1
  }, [])
  const show = useCallback((index, elapsed = 0) => {
    const steps = stepsRef.current
    if (!steps.length) return
    index = Math.max(0, Math.min(index, steps.length - 1))
    indexRef.current = index
    const glows = new Map(), badges = new Map()
    for (let i = 0; i <= index; i++) {
      const edge = steps[i].edge, color = edge.strokeColor || '#6ea8ff'
      const source = edge.startBinding?.elementId ?? edge.start?.id
      const target = edge.endBinding?.elementId ?? edge.end?.id
      if (i < index) { glows.set(target, color); badges.set(target, { kind: 'success', color }) }
      else { glows.set(source, color); badges.set(source, { kind: 'active', color }) }
    }
    presentRef.current = { activeIds: new Set([steps[index].edge.id]), glows, badges, motionStart: performance.now() - elapsed / speedRef.current, motionElapsed: elapsed, motionSpeed: speedRef.current, motionPaused: !playingRef.current }
    setCursor(index + 1); setDescription(steps[index].description || '')
    clear()
    if (playingRef.current) {
      const edge = steps[index].edge
      const delay = Math.max(0, ((edge.customData?.flowpulse?.durationMs ?? 2200) - elapsed) / speedRef.current + 420)
      timerRef.current = setTimeout(() => {
        if (indexRef.current < stepsRef.current.length - 1) show(indexRef.current + 1)
        else {
          const edge = stepsRef.current[indexRef.current].edge
          const target = edge.endBinding?.elementId ?? edge.end?.id
          const color = edge.strokeColor || '#6ea8ff'
          glows.set(target, color); badges.set(target, { kind: 'success', color })
          presentRef.current = { ...presentRef.current, activeIds: new Set(), glows, badges, motionPaused: true }
          playingRef.current = false; setPlaying(false)
        }
      }, delay)
    }
  }, [])
  const play = useCallback(({ speed = 1, flow } = {}) => {
    const elements = apiRef.current?.getSceneElements() ?? []
    const resolved = resolveSteps(flow ? flow.steps : makeDefaultSteps(elements), elements)
    if (resolved.missing.length) return { error: `流程中有 ${resolved.missing.length} 条连线已删除或解除绑定，请先修复流程` }
    if (!resolved.steps.length) return { error: '没有可播放的连线步骤' }
    clear(); stepsRef.current = resolved.steps; speedRef.current = speed
    playingRef.current = true; setPlaying(true); setTotal(resolved.steps.length)
    setFlowName(flow?.name || '自动演示'); show(0)
    return { ok: true }
  }, [apiRef, show])
  const move = useCallback((delta) => { playingRef.current = false; setPlaying(false); show(indexRef.current + delta) }, [show])
  const toggle = useCallback(() => {
    const p = presentRef.current
    if (!p) return
    if (playingRef.current) {
      p.motionElapsed = (performance.now() - p.motionStart) * p.motionSpeed
      p.motionPaused = true; playingRef.current = false; clear(); setPlaying(false)
    } else {
      // Resume the remaining time and preserve particle position.
      playingRef.current = true; setPlaying(true)
      show(indexRef.current, p.motionElapsed)
    }
  }, [show])
  return { playing, cursor, total, description, flowName, play, stop, move, toggle, snapshot: () => presentRef.current }
}
