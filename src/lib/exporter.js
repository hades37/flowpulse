/**
 * FlowPulse 导出模块（纯 ESM）
 *
 * 提供「静态场景 + 数据包动画」的三种导出：
 *   1. exportPNG   —— 纯静态场景 PNG（内容自适应尺寸，不含数据包）
 *   2. exportGIF   —— GIF 动图（exportToBlob 底图 + overlay 逐帧合成，gifenc 编码）
 *   3. exportWebM  —— WebM 视频（MediaRecorder 录制 canvas.captureStream）
 *
 * 动画导出使用当前视口的静态画布和动画画布进行合成。
 */

import { exportToBlob } from '@excalidraw/excalidraw';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

/* ------------------------------------------------------------------ */
/* 内部工具函数（不导出）                                              */
/* ------------------------------------------------------------------ */

/** 等待指定毫秒（GIF 逐帧间隔，让 overlay 动画自然前进） */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 让出一帧给浏览器（requestAnimationFrame），供 UI 呼吸 / overlay 继续播放 */
const tick = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** 统一下载：把 Blob 保存为本地文件（所有导出入口都走这里） */
function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a); // Firefox 需要 a 在文档中才能触发点击
  a.click();
  a.remove();
  // 稍后再释放，避免个别浏览器在下载真正开始前就回收了地址
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** 读取 overlay 画布的有效尺寸：clientWidth/clientHeight 优先，退化到位图尺寸，再退化到窗口尺寸 */
function getOverlaySize(overlayCanvas) {
  const w =
    overlayCanvas.clientWidth || overlayCanvas.width || window.innerWidth || 640;
  const h =
    overlayCanvas.clientHeight || overlayCanvas.height || window.innerHeight || 480;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/** Capture the visible canvas so the base and animation share coordinates. */
async function exportViewportBaseImage(api, width, height, label) {
  // Capture the same viewport transform as the animation overlay.
  const source = document.querySelector('.canvas-wrap canvas.excalidraw__canvas.static');
  if (!source) throw new Error(`${label}底图导出失败：找不到画布`);
  const snapshot = document.createElement('canvas');
  snapshot.width = width;
  snapshot.height = height;
  snapshot.getContext('2d').drawImage(source, 0, 0, width, height);
  return snapshot;
}

/* ------------------------------------------------------------------ */
/* 1) PNG 静态导出（不含数据包）                                       */
/* ------------------------------------------------------------------ */

/**
 * 导出当前场景为 PNG（内容自适应尺寸）。
 * @param opts {{ api: any, fileName?: string, padding?: number }}
 *   - api：Excalidraw API（getSceneElements / getAppState 可用）
 *   - fileName：文件名（不含扩展名），默认 'flowpulse'
 *   - padding：内容四周留白（px），默认 48
 */
export async function exportPNG({
  api,
  fileName = 'flowpulse',
  padding = 48,
} = {}) {
  const elements = api.getSceneElements() || [];
  // 内容自适应：exportPadding 即 padding，天然宽度 = 内容宽 + 2*padding；
  // 宽度保底 320，避免内容过窄 / 空画布时导出过小的图。
  const blob = await exportToBlob({
    elements,
    appState: { ...api.getAppState(), exportBackground: true },
    files: null,
    exportPadding: padding,
    mimeType: 'image/png',
    fileType: 'image/png', // 契约约定参数，多余字段对 exportToBlob 无害
    getDimensions: (contentW, contentH) => ({
      width: Math.max(320, Math.round(contentW)),
      height: Math.max(1, Math.round(contentH)),
      scale: 1,
    }),
  });
  download(blob, `${fileName}.png`);
}

/* ------------------------------------------------------------------ */
/* 2) GIF 动图导出                                                     */
/* ------------------------------------------------------------------ */

/**
 * 导出 GIF 动图：静态场景底图 + overlay 数据包动画逐帧合成。
 * @param opts {{
 *   api: any,
 *   overlayCanvas: HTMLCanvasElement,
 *   duration?: number,   // 时长（秒），默认 4
 *   fps?: number,        // 帧率，默认 12
 *   fileName?: string,   // 默认 'flowpulse'
 *   onProgress?: (p: number) => void, // 0..1 每帧回调
 * @returns {Promise<{ size: number }>} 生成文件的字节大小
 */
export async function exportGIF({
  api,
  overlayCanvas,
  duration = 4,
  fps = 12,
  fileName = 'flowpulse',
  onProgress,
} = {}) {
  if (!overlayCanvas) throw new Error('GIF 导出失败：未提供 overlay 画布');

  const frameFps = Math.max(1, Math.min(60, Math.round(fps) || 12));
  const total = Math.max(1, Math.round(duration * frameFps)); // 总帧数 = duration 秒 × fps 帧
  const delayMs = Math.round(1000 / frameFps); // 每帧间隔（同时作为 GIF 帧延迟）
  const { width, height } = getOverlaySize(overlayCanvas);

  // a. 底图：异步、只导出一次（视口尺寸，与 overlay 对齐）
  const baseImage = await exportViewportBaseImage(api, width, height, 'GIF');

  // b. 离屏合成画布（willReadFrequently：每帧都要 getImageData）
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // c. gifenc 编码：首帧 quantize 建调色板，之后每帧 applyPalette + writeFrame
  const gif = GIFEncoder();
  let palette = null;

  for (let i = 0; i < total; i++) {
    if (i > 0) await sleep(delayMs); // 间隔 setTimeout(1000/fps)，让 overlay 动画自然前进

    ctx.drawImage(baseImage, 0, 0, width, height); // 静态场景底图
    ctx.drawImage(overlayCanvas, 0, 0, width, height); // overlay 即视口尺寸，直接整幅叠加

    const { data } = ctx.getImageData(0, 0, width, height);
    if (i === 0) palette = quantize(data, 256); // 首帧建立调色板（后续复用）
    const index = applyPalette(data, palette);
    gif.writeFrame(index, width, height, { palette, delay: delayMs });

    if (typeof onProgress === 'function') onProgress((i + 1) / total);
    if ((i + 1) % 2 === 0) await tick(); // 每 2 帧让 UI 呼吸一下
  }

  gif.finish();
  const bytes = gif.bytesView ? gif.bytesView() : gif.bytes();
  const blob = new Blob([bytes], { type: 'image/gif' });
  download(blob, `${fileName}.gif`);
  return { size: blob.size };
}

/* ------------------------------------------------------------------ */
/* 3) WebM 视频导出                                                    */
/* ------------------------------------------------------------------ */

/**
 * 导出 WebM 视频：离屏合成 canvas + MediaRecorder 录制 captureStream(30)。
 * @param opts {{
 *   api: any,
 *   overlayCanvas: HTMLCanvasElement,
 *   duration?: number,   // 时长（秒），默认 4
 *   fileName?: string,   // 默认 'flowpulse'
 *   onProgress?: (p: number) => void, // 0..1 回调
 * @returns {Promise<{ size: number }>} 生成文件的字节大小
 */
export async function exportWebM({
  api,
  overlayCanvas,
  duration = 4,
  fileName = 'flowpulse',
  onProgress,
} = {}) {
  if (!overlayCanvas) throw new Error('WebM 导出失败：未提供 overlay 画布');
  const { width, height } = getOverlaySize(overlayCanvas);

  // 底图（视口尺寸，与 overlay 对齐；失败抛中文错误）
  const baseImage = await exportViewportBaseImage(api, width, height, 'WebM');

  // 离屏合成画布 + 视频流
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (typeof canvas.captureStream !== 'function') {
    throw new Error('WebM 导出失败：当前浏览器不支持 canvas.captureStream');
  }

  // mimeType 探测：vp9 -> vp8 -> 通用 webm
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const mimeType =
    typeof MediaRecorder !== 'undefined' &&
    candidates.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) {
    throw new Error('WebM 导出失败：当前浏览器不支持 WebM（video/webm）视频录制');
  }

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000, // 8 Mbps，保证线条 / 动画清晰度
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  recorder.start(100); // 每 100ms 切一块数据，中途异常时也不至于整段丢失

  // RAF 循环实时合成：底图 + overlay（overlay 处于 RAF 播放中，实时抓帧）
  const durationMs = Math.max(0.001, duration) * 1000;
  await new Promise((resolve) => {
    const t0 = performance.now();
    const step = () => {
      const elapsed = performance.now() - t0;
      ctx.drawImage(baseImage, 0, 0, width, height);
      ctx.drawImage(overlayCanvas, 0, 0, width, height);
      if (typeof onProgress === 'function') {
        onProgress(Math.min(1, elapsed / durationMs));
      }
      if (elapsed >= durationMs) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop()); // 释放画布轨道

  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size === 0) {
    throw new Error('WebM 导出失败：未录制到任何视频数据');
  }
  download(blob, `${fileName}.webm`);
  return { size: blob.size };
}
