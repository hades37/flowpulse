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
