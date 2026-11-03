/**
 * storage.js —— FlowPulse 存储 / 分享模块（零后端）
 *
 * 职责：
 *  1. 工程文件导出 / 导入（<名称>.flowpulse-ex.json，blob + a.click() 下载）
 *  2. localStorage 自动保存 / 恢复（静默容错，不可用时不打扰用户）
 *  3. 零后端分享链接：把场景压缩进 URL hash（#/v/<压缩串>），可生成 iframe 嵌入片段
 *
 * 约定：所有对外 payload 一律带 format 字段（'flowpulse-ex/1'），读取时严格校验。
 */
import LZString from 'lz-string'

/** 统一的文件 / 分享 payload 版本标识 */
const FILE_FORMAT = 'flowpulse-ex/1'

/** 分享链接在 hash 中的路由前缀，形如 #/v/xxx */
const SHARE_PREFIX = '#/v/'

/** 默认图形名称 */
const DEFAULT_NAME = '未命名图'

/* ================================================================
 * 一、通用私有工具
 * ================================================================ */

/**
 * 私有统一下载入口：所有文件下载都必须走这里。
 * @param {Blob} blob 待下载内容的 blob
 * @param {string} fileName 下载保存的文件名
 */
function download(blob, fileName) {
  // 生成临时对象 URL 并用隐藏 <a> 触发浏览器下载
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  // 某些浏览器要求 <a> 在文档中才能触发点击下载
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 及时释放对象 URL，避免内存泄漏
  URL.revokeObjectURL(url)
}

/**
 * 清洗文件名：去掉 Windows / macOS 不允许的字符，防止下载失败或路径逃逸。
 * @param {string} name 原始名称
 * @returns {string} 安全文件名（为空时回退为默认名）
 */
function sanitizeFileName(name) {
  const cleaned = String(name ?? '')
    .replace(/[\\/:*?"<>|]/g, '_') // 替换非法字符
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '') // Windows 不允许结尾是点/空格
  return cleaned || DEFAULT_NAME
}

/**
 * 校验一组数据是否是合法的场景元素数组。
 * 只做结构性校验（是否为数组），元素内部字段由 Excalidraw 自行容错渲染。
 * @param {unknown} elements 待校验数据
 * @returns {boolean}
 */
function isValidElements(elements) {
  return Array.isArray(elements)
}

/**
 * 从 payload 中安全取出名称（非空字符串才采纳，否则回退默认名）。
 * @param {object} data 已解析的 payload 对象
 * @returns {string}
 */
function pickName(data) {
  return typeof data?.name === 'string' && data.name.trim() ? data.name : DEFAULT_NAME
}

/* ================================================================
 * 二、工程文件：导出 / 导入
 * ================================================================ */

/**
 * 把当前场景保存为工程文件：序列化为 JSON 后触发下载 <name>.flowpulse-ex.json。
 * @param {Array<object>} elements Excalidraw 场景元素数组（getSceneElements 的返回值，含 customData）
 * @param {string} [name] 图形名称，默认「未命名图」
 * @returns {string} 实际下载的文件名
 */
export function saveSceneFile(elements, name = DEFAULT_NAME, flows) {
  const safeName = sanitizeFileName(name)
  // 统一的工程文件 payload 结构
  const payload = {
    format: FILE_FORMAT,
    name: safeName,
    savedAt: new Date().toISOString(),
    elements,
    ...(Array.isArray(flows) ? { flows } : {}),
  }
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const fileName = `${safeName}.flowpulse-ex.json`
  download(blob, fileName)
  return fileName
}

/**
 * 解析工程文件文本（用户通过文件选择器读出的 JSON 字符串）。
 * @param {string} text 文件文本内容
 * @returns {{ elements: Array<object>, name: string }}
 * @throws {Error} 内容非法（非 JSON / 非 objected / format 不符 / elements 非数组）时抛出中文错误
 */
export function parseSceneFile(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('无法解析文件：内容不是有效的 JSON 文本')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('文件结构不正确：缺少场景数据对象')
  }
  if (data.format !== FILE_FORMAT) {
    throw new Error(`文件格式不兼容：期望 ${FILE_FORMAT}，实际为「${String(data.format)}」`)
  }
  if (!isValidElements(data.elements)) {
    throw new Error('文件内容不完整：缺少有效的 elements 元素数组')
  }
  return { elements: data.elements, name: pickName(data), ...(Array.isArray(data.flows) ? { flows: data.flows } : {}) }
}

/* ================================================================
 * 三、localStorage 自动保存
 * ================================================================ */

/** 自动保存 payload 的存储键 */
export const KEY_AUTOSAVE = 'flowpulse-ex.autosave'

/** 图形名称的独立存储键（供 UI 单独读取，不必反序列化整个场景） */
export const KEY_NAME = 'flowpulse-ex.name'

/**
 * 把场景写入 localStorage 自动保存。任何失败（隐私模式、配额超限、序列化异常）
 * 一律静默吞掉——自动保存是尽力而为的辅助能力，不应打断用户绘图。
 * @param {Array<object>} elements 场景元素数组
 * @param {string} name 图形名称
 */
export function persistAutosave(elements, name, flows) {
  try {
    const payload = {
      format: FILE_FORMAT,
      name: pickName({ name }),
      savedAt: new Date().toISOString(),
      elements,
      ...(Array.isArray(flows) ? { flows } : {}),
    }
    localStorage.setItem(KEY_AUTOSAVE, JSON.stringify(payload))
    localStorage.setItem(KEY_NAME, payload.name)
  } catch {
    // 静默失败：无 localStorage 或超出配额时放弃本次自动保存
  }
}

/**
 * 读取自动保存的场景。
 * @returns {{ elements: Array<object>, name: string } | null}
 *   无存档、JSON 损坏、format 不符或 elements 非数组时一律返回 null。
 */
export function readAutosave() {
  try {
    const raw = localStorage.getItem(KEY_AUTOSAVE)
    if (!raw) return null
    const data = JSON.parse(raw)
    // 与分享链接同等严格的校验：format 与 elements 数组必须同时合法
    if (
      !data ||
      typeof data !== 'object' ||
      data.format !== FILE_FORMAT ||
      !isValidElements(data.elements)
    ) {
      return null
    }
    // 名称优先取 payload；缺失时再尝试独立的名称键；仍没有则用默认名
    const fallbackName = localStorage.getItem(KEY_NAME)
    const name =
      typeof data.name === 'string' && data.name.trim()
        ? data.name
        : (fallbackName && fallbackName.trim()) || DEFAULT_NAME
    return { elements: data.elements, name, ...(Array.isArray(data.flows) ? { flows: data.flows } : {}) }
  } catch {
    // 读取/解析任何环节出错都视为没有可用存档
    return null
  }
}

/* ================================================================
 * 四、零后端分享链接
 * ================================================================ */

/**
 * 把场景编码为零后端分享链接。
 * payload（含 format 字段）JSON 序列化后用 LZString 压缩进 URL hash：
 *   `${origin}${pathname}#/v/<compressToEncodedURIComponent 结果>`
 * @param {Array<object>} elements 场景元素数组
 * @param {string} [name] 图形名称，默认「未命名图」
 * @returns {string} 可直接复制给别人的完整 URL
 */
export function buildShareUrl(elements, name = DEFAULT_NAME, flows) {
  // 分享 payload 同样携带 format 字段，decode 时校验
  const payload = { format: FILE_FORMAT, name: pickName({ name }), elements, ...(Array.isArray(flows) ? { flows } : {}) }
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload))
  const { origin, pathname } = window.location
  return `${origin}${pathname}${SHARE_PREFIX}${compressed}`
}

/**
 * 解析地址栏 hash 中的分享场景。
 * @param {string} hash location.hash，形如 '#/v/xxx'
 * @returns {{ elements: Array<object>, name: string } | null}
 *   不是分享 hash、解压失败、JSON 非法、format 不符或 elements 非数组时返回 null。
 */
export function decodeShareHash(hash) {
  try {
    if (typeof hash !== 'string') return null
    const idx = hash.indexOf(SHARE_PREFIX)
    if (idx === -1) return null // 不是分享链接
    const compressed = hash.slice(idx + SHARE_PREFIX.length).trim()
    if (!compressed) return null
    // 解压：非法字符 / 被截断的串会返回 null 或抛错
    const text = LZString.decompressFromEncodedURIComponent(compressed)
    if (!text) return null
    const data = JSON.parse(text)
    if (
      !data ||
      typeof data !== 'object' ||
      data.format !== FILE_FORMAT ||
      !isValidElements(data.elements)
    ) {
      return null
    }
    return { elements: data.elements, name: pickName(data), ...(Array.isArray(data.flows) ? { flows: data.flows } : {}) }
  } catch {
    // 任何解析异常都按「无效分享链接」处理，交由调用方走正常初始化
    return null
  }
}

/**
 * 生成 iframe 嵌入代码片段（供用户粘贴到博客 / 文档中）。
 * @param {string} url 分享链接（通常来自 buildShareUrl）
 * @param {number} [w] iframe 宽度，默认 960
 * @param {number} [h] iframe 高度，默认 540
 * @returns {string} 形如 `<iframe src="..." width="960" height="540" ...></iframe>` 的代码片段
 */
export function embedSnippet(url, w = 960, h = 540) {
  // 对进入 HTML 属性的 URL 做最小转义，避免引号/尖括号破坏标签结构
  const safeUrl = String(url ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // 宽高取整数，非法输入回退默认值
  const width = Number.isFinite(Number(w)) && Number(w) > 0 ? Math.floor(Number(w)) : 960
  const height = Number.isFinite(Number(h)) && Number(h) > 0 ? Math.floor(Number(h)) : 540
  return `<iframe src="${safeUrl}" width="${width}" height="${height}" style="border:1px solid #d4d4d4;border-radius:8px" loading="lazy" allowfullscreen></iframe>`
}
