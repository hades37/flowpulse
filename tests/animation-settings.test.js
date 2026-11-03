import test from 'node:test'
import assert from 'node:assert/strict'
import { animationEnabled, withAnimationSetting } from '../src/flow/settings.js'
import { createOverlay } from '../src/flow/overlay.js'
import { buildShareUrl, decodeShareHash, persistAutosave, readAutosave } from '../src/lib/storage.js'

test('individual settings default to enabled and survive autosave and sharing', () => {
  const node = { id: 'node', customData: { other: 42, flowpulse: { extra: 'kept' } } }
  const disabled = { ...node, customData: withAnimationSetting(node, false) }
  const other = { id: 'other' }
  assert.equal(animationEnabled(disabled), false)
  assert.equal(animationEnabled(other), true)
  assert.equal(disabled.customData.other, 42)
  assert.equal(disabled.customData.flowpulse.extra, 'kept')
  const data = new Map()
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
  globalThis.window = { location: { origin: 'https://example.test', pathname: '/' } }
  persistAutosave([disabled, other], '测试')
  const restored = readAutosave().elements
  assert.equal(animationEnabled(restored[0]), false)
  assert.equal(animationEnabled(restored[1]), true)
  const shared = decodeShareHash(new URL(buildShareUrl(restored, '测试')).hash).elements
  assert.equal(animationEnabled(shared[0]), false)
  assert.equal(animationEnabled(shared[1]), true)
})

test('disabled edges and nodes do not render their effects while other elements still do', () => {
  let arcs = 0, strokes = 0, texts = 0
  const ctx = { clearRect() {}, beginPath() {}, arc() { arcs++ }, fill() {}, stroke() { strokes++ }, moveTo() {}, arcTo() {}, closePath() {}, fillText() { texts++ } }
  const overlay = createOverlay({ clientWidth: 300, clientHeight: 200, getContext: () => ctx })
  const nodeOff = { id: 'off', x: 0, y: 0, width: 20, height: 20, customData: { flowpulse: { animationEnabled: false } } }
  const nodeOn = { id: 'on', x: 100, y: 0, width: 20, height: 20 }
  const edge = (id, target, enabled) => ({ id, x: 0, y: 0, points: [[0, 0], [100, 0]], endBinding: { elementId: target }, customData: { flowpulse: { packets: 1, durationMs: 1000, animationEnabled: enabled } } })
  const arrows = [edge('disabled', 'on', false), edge('enabled', 'off', true)]
  const byId = new Map([[nodeOff.id, nodeOff], [nodeOn.id, nodeOn]])
  const present = { glows: new Map([['off', 'red'], ['on', 'blue']]), badges: new Map([['off', { color: 'red' }], ['on', { color: 'blue' }]]) }
  const render = (time) => overlay.render({ arrows, byId, state: { zoom: { value: 1 }, scrollX: 0, scrollY: 0 }, time, onArrive() {}, present })
  render(0)
  assert.equal(arcs, 3) // one enabled packet (two circles), one enabled badge
  assert.equal(strokes, 1) // only the enabled node glows
  assert.equal(texts, 1)
  arcs = strokes = texts = 0
  render(1001)
  assert.equal(arcs, 3) // disabled destination does not produce an arrival ripple
  assert.equal(strokes, 1)
})
