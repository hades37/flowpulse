/**
 * 数据包运动学（自主分支移植的核心理念）：
 * 包在一条边上的位置由时间解析可算，无需逐帧几何查询：
 *   progress_i(t) = (t / dur + i / n) % 1
 * 到达检测：帧间 progress 回绕（prev > curr）即一次到达。
 */

/** 生成某时刻一条边的全部包进度（0~1 升序数组） */
export function progresses(tMs, packetCount, durationMs) {
  const out = []
  for (let i = 0; i < packetCount; i++) {
    out.push(((tMs / durationMs) + i / packetCount) % 1)
  }
  return out
}

/** 两点直线插值点 */
export function lerpPoint(a, b, p) {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p }
}

/** Sample a path by distance so packets maintain a steady speed through bends. */
export function pointAlongPath(points, progress) {
  if (!points.length) return { x: 0, y: 0 }
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (!total) return points[0]
  let distance = Math.max(0, Math.min(1, progress)) * total
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] && lengths[i]) return lerpPoint(points[i], points[i + 1], distance / lengths[i])
    distance -= lengths[i]
  }
  return points[points.length - 1]
}

/** Sample the same Catmull–Rom cubic segments used by Excalidraw's curved arrows. */
export function arrowPath(edge) {
  const points = edge.points.map(([x, y]) => ({ x: edge.x + x, y: edge.y + y }))
  if (points.length < 2) return points
  let result = points
  if (edge.elbowed && points.length > 2) {
    result = [points[0]]
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1]
      const len1 = Math.hypot(b.x - a.x, b.y - a.y), len2 = Math.hypot(c.x - b.x, c.y - b.y)
      const radius = Math.min(16, len1 / 2, len2 / 2)
      if (!len1 || !len2) { result.push(b); continue }
      const start = lerpPoint(b, a, radius / len1), end = lerpPoint(b, c, radius / len2)
      result.push(start)
      for (let step = 1; step <= 12; step++) {
        const t = step / 12, u = 1 - t
        result.push({ x: u * u * start.x + 2 * u * t * b.x + t * t * end.x, y: u * u * start.y + 2 * u * t * b.y + t * t * end.y })
      }
    }
    result.push(points.at(-1))
  } else if (edge.roundness && points.length > 2) {
    result = [points[0]]
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[Math.max(i - 1, 0)], b = points[i], c = points[i + 1], d = points[Math.min(i + 2, points.length - 1)]
      const c1 = { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 }
      const c2 = { x: c.x + (b.x - d.x) / 6, y: c.y + (b.y - d.y) / 6 }
      for (let step = 1; step <= 20; step++) {
        const t = step / 20, u = 1 - t
        result.push({ x: u ** 3 * b.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * c.x, y: u ** 3 * b.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * c.y })
      }
    }
  }
  if (edge.angle) {
    const xs = result.map((p) => p.x), ys = result.map((p) => p.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const cos = Math.cos(edge.angle), sin = Math.sin(edge.angle)
    result = result.map(({ x, y }) => ({ x: cx + (x - cx) * cos - (y - cy) * sin, y: cy + (x - cx) * sin + (y - cy) * cos }))
  }
  return result
}
