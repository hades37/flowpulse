import test from 'node:test'
import assert from 'node:assert/strict'
import { arrowPath, pointAlongPath, progresses } from '../src/flow/kinematics.js'
import { buildShareUrl, decodeShareHash, parseSceneFile, persistAutosave, readAutosave } from '../src/lib/storage.js'

test('packets follow the length of a bent line', () => {
  const path = arrowPath({ x: 10, y: 20, points: [[0, 0], [100, 0], [100, 100]] })
  assert.deepEqual(pointAlongPath(path, 0.5), { x: 110, y: 20 })
  assert.deepEqual(pointAlongPath(path, 0.75), { x: 110, y: 70 })
  assert.deepEqual(progresses(500, 2, 1000), [0.5, 0])
})

test('rounded paths pass through control points using Excalidraw cubic geometry', () => {
  const path = arrowPath({ x: 0, y: 0, roundness: { type: 2 }, points: [[0, 0], [100, 100], [200, 0]] })
  assert.deepEqual(path[0], { x: 0, y: 0 })
  assert.deepEqual(path[20], { x: 100, y: 100 })
  assert.deepEqual(path.at(-1), { x: 200, y: 0 })
  assert.ok(Math.abs(path[10].x - 43.75) < 1e-6)
  assert.ok(Math.abs(path[10].y - 56.25) < 1e-6)
})

test('elbow arrows round corners and rotated paths rotate with the arrow', () => {
  const path = arrowPath({ x: 0, y: 0, elbowed: true, points: [[0, 0], [100, 0], [100, 100]] })
  assert.deepEqual(path[1], { x: 84, y: 0 })
  assert.deepEqual(path[13], { x: 100, y: 16 })
  const rotated = arrowPath({ x: 0, y: 0, angle: Math.PI / 2, points: [[0, 0], [100, 0]] })
  assert.ok(Math.abs(rotated[0].x - 50) < 1e-6 && Math.abs(rotated[0].y + 50) < 1e-6)
})

test('empty scenes and names survive autosave, and invalid files are rejected', () => {
  const data = new Map()
  globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  persistAutosave([], '空白图')
  assert.deepEqual(readAutosave(), { elements: [], name: '空白图' })
  assert.throws(() => parseSceneFile('{'))
  assert.throws(() => parseSceneFile('{"format":"wrong","elements":[]}'))
})

test('share links round-trip scene data and reject malformed links', () => {
  globalThis.window = { location: { origin: 'https://example.test', pathname: '/app/' } }
  const elements = [{ id: 'one', type: 'rectangle' }]
  const url = buildShareUrl(elements, '测试')
  assert.deepEqual(decodeShareHash(new URL(url).hash), { name: '测试', elements })
  assert.equal(decodeShareHash('#/v/invalid'), null)
})
