import test from 'node:test'
import assert from 'node:assert/strict'
import { availableArrows, makeDefaultSteps, normalizeFlows, resolveSteps } from '../src/flow/scenarios.js'
import { buildShareUrl, decodeShareHash, parseSceneFile, persistAutosave, readAutosave } from '../src/lib/storage.js'

const elements = [
  { id: 'a', type: 'arrow', startBinding: { elementId: 's' }, endBinding: { elementId: 't' } },
  { id: 'b', type: 'arrow', startBinding: { elementId: 't' }, endBinding: { elementId: 'u' } },
  { id: 'unbound', type: 'arrow' },
]

test('flows preserve ordering, repetition and missing link detection', () => {
  assert.equal(availableArrows(elements).length, 2)
  assert.deepEqual(makeDefaultSteps(elements).map((s) => s.edgeId), ['a', 'b'])
  const result = resolveSteps([{ edgeId: 'b', description: '第二条' }, { edgeId: 'a' }, { edgeId: 'b' }, { edgeId: 'gone' }], elements)
  assert.deepEqual(result.steps.map((s) => s.edge.id), ['b', 'a', 'b'])
  assert.equal(result.missing.length, 1)
})

test('flows survive file parsing, autosave and sharing; old files remain valid', () => {
  const flows = [{ id: 'login', name: '登录', steps: [{ edgeId: 'a', description: '鉴权' }] }]
  const payload = { format: 'flowpulse-ex/1', name: '图', elements, flows }
  assert.deepEqual(parseSceneFile(JSON.stringify(payload)).flows, flows)
  assert.deepEqual(normalizeFlows(parseSceneFile(JSON.stringify({ ...payload, flows: undefined })).flows), [])
  const data = new Map()
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
  globalThis.window = { location: { origin: 'https://example.test', pathname: '/' } }
  persistAutosave(elements, '图', flows)
  assert.deepEqual(readAutosave().flows, flows)
  assert.deepEqual(decodeShareHash(new URL(buildShareUrl(elements, '图', flows)).hash).flows, flows)
})
