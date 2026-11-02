/**
 * FlowPulse 场景模板
 *
 * 纯静态数据模块：在模块顶层调用 convertToExcalidrawElements 完成转换，
 * 宿主直接消费 TEMPLATES[i].elements。
 *
 * 简写约定：
 *  - 形状：rectangle / diamond / ellipse，带语义 id 与中文标签（fontSize 20）
 *  - 箭头：start / end 双向绑定到形状 id；customData.flowpulse 携带动画参数
 *    { packets: 数据包数量 1-3, durationMs: 单周期毫秒 1400-3000 }
 *  - 布局：主流程沿 x 方向步进约 300，分支沿 y 方向间隔约 200
 *  - 箭头 x/y 取源形状右边缘中点（回退 / 返回类箭头取源形状左边缘顶点），
 *    convert 工具会按绑定重算端点，坐标仅作初始参考
 */
import { convertToExcalidrawElements } from '@excalidraw/excalidraw'

/** 形状简写 */
const shape = (type, id, x, y, width, height, text, strokeColor) => ({
  type,
  id,
  x,
  y,
  width,
  height,
  label: { text, fontSize: 20 },
  strokeColor,
  fillStyle: 'solid',
  roughness: 0,
  strokeWidth: 2,
})

/** 箭头简写（含 flowpulse 动画参数） */
const arrow = (x, y, strokeColor, fromId, toId, packets, durationMs) => ({
  type: 'arrow',
  x,
  y,
  strokeColor,
  strokeWidth: 2,
  roughness: 0,
  start: { id: fromId, type: 'arrow' },
  end: { id: toId, type: 'arrow' },
  customData: { flowpulse: { packets, durationMs } },
})

/** 模板定义：模块加载时即完成 Excalidraw 元素转换 */
const define = (id, name, desc, skeleton) => ({
  id,
  name,
  desc,
  elements: convertToExcalidrawElements(skeleton),
})

export const TEMPLATES = [
  // ---------------------------------------------------------------- micro-service
  // 客户端 → 网关 → 鉴权(菱形) → 订单服务 → 数据库(椭圆)，横向单链路
  define(
    'micro-service',
    '微服务调用链',
    '请求包从客户端出发，经网关、鉴权、订单服务逐跳推进直至落库，各段速度与包量层层递进，展示链路耗时差异。',
    [
      shape('rectangle', 'ms-client', 80, 320, 160, 80, '客户端', '#57d68f'),
      shape('rectangle', 'ms-gateway', 380, 320, 160, 80, '网关', '#6ea8ff'),
      shape('diamond', 'ms-auth', 680, 290, 180, 140, '鉴权', '#ffb454'),
      shape('rectangle', 'ms-order', 980, 320, 160, 80, '订单服务', '#2dd4bf'),
      shape('ellipse', 'ms-db', 1290, 315, 180, 90, '数据库', '#ff7a7a'),

      arrow(240, 360, '#57d68f', 'ms-client', 'ms-gateway', 2, 1600),
      arrow(540, 360, '#6ea8ff', 'ms-gateway', 'ms-auth', 2, 1800),
      arrow(860, 360, '#ffb454', 'ms-auth', 'ms-order', 2, 2200),
      arrow(1140, 360, '#2dd4bf', 'ms-order', 'ms-db', 1, 2400),
    ],
  ),

  // ---------------------------------------------------------------- auth-flow
  // 开始 → 账号校验(菱形) → 通过(上支路)/失败(下支路，慢速红边)
  define(
    'auth-flow',
    '登录鉴权',
    '账号校验一分为二：通过侧三枚绿包飞速签发令牌，失败侧单包红线以 2800ms 慢速坠入拒绝访问。',
    [
      shape('rectangle', 'af-start', 80, 320, 160, 80, '开始', '#2dd4bf'),
      shape('diamond', 'af-check', 400, 290, 180, 140, '账号校验', '#6ea8ff'),
      shape('rectangle', 'af-token', 720, 120, 160, 80, '签发令牌', '#57d68f'),
      shape('rectangle', 'af-reject', 720, 520, 160, 80, '拒绝访问', '#ff7a7a'),

      arrow(240, 360, '#2dd4bf', 'af-start', 'af-check', 2, 1600),
      arrow(580, 360, '#57d68f', 'af-check', 'af-token', 3, 1800),
      arrow(580, 360, '#ff7a7a', 'af-check', 'af-reject', 1, 2800), // 慢速红边
    ],
  ),

  // ---------------------------------------------------------------- cache-pattern
  // 应用 → 缓存 → 命中(绿快线折返应用) / 未命中(红慢线) → 数据库 → 回填(紫线回缓存)
  define(
    'cache-pattern',
    '缓存读写',
    '命中时三枚绿包沿 1400ms 快线折返应用，未命中则单包红线慢穿数据库，再由紫色回填线写回缓存。',
    [
      shape('rectangle', 'cp-app', 100, 320, 160, 80, '应用', '#6ea8ff'),
      shape('ellipse', 'cp-cache', 460, 315, 180, 90, '缓存', '#2dd4bf'),
      shape('ellipse', 'cp-db', 880, 315, 180, 90, '数据库', '#ffb454'),

      arrow(260, 360, '#6ea8ff', 'cp-app', 'cp-cache', 2, 1500), // 读写请求
      arrow(640, 360, '#57d68f', 'cp-cache', 'cp-app', 3, 1400), // 命中：绿快线
      arrow(640, 360, '#ff7a7a', 'cp-cache', 'cp-db', 1, 2800), // 未命中：红慢线
      arrow(1060, 360, '#b28cff', 'cp-db', 'cp-cache', 2, 2000), // 回填：紫线
    ],
  ),

  // ---------------------------------------------------------------- fanout
  // 事件总线 → 搜索 / 推荐 / 审计 / 通知，四路 y 间隔 200、1500-2600ms 错峰扇出
  define(
    'fanout',
    '事件扇出',
    '一个事件从总线同时撒向四路订阅者，1500-2600ms 错峰出发、包量各异，涟漪般层层扩散。',
    [
      shape('rectangle', 'fo-bus', 100, 320, 180, 80, '事件总线', '#b28cff'),
      shape('rectangle', 'fo-search', 620, 60, 160, 80, '搜索索引', '#57d68f'),
      shape('rectangle', 'fo-rec', 620, 260, 160, 80, '推荐服务', '#6ea8ff'),
      shape('rectangle', 'fo-audit', 620, 460, 160, 80, '审计日志', '#ffb454'),
      shape('rectangle', 'fo-notify', 620, 660, 160, 80, '消息通知', '#2dd4bf'),

      arrow(280, 360, '#57d68f', 'fo-bus', 'fo-search', 3, 1500),
      arrow(280, 360, '#6ea8ff', 'fo-bus', 'fo-rec', 2, 1800),
      arrow(280, 360, '#ffb454', 'fo-bus', 'fo-audit', 2, 2300),
      arrow(280, 360, '#2dd4bf', 'fo-bus', 'fo-notify', 1, 2600),
    ],
  ),

  // ---------------------------------------------------------------- cicd
  // 提交 → 构建 → 测试(菱形) →通过→ 制品库 → 部署 → 监控；失败红线折返构建
  define(
    'cicd',
    'CI/CD 流水线',
    '自动化测试分流两路：通过侧三包橙线直奔制品库并一路部署监控，失败侧单包红线折返构建重试。',
    [
      shape('rectangle', 'cd-commit', 80, 320, 160, 80, '代码提交', '#57d68f'),
      shape('rectangle', 'cd-build', 380, 320, 160, 80, '构建', '#6ea8ff'),
      shape('diamond', 'cd-test', 680, 290, 180, 140, '自动化测试', '#ffb454'),
      shape('rectangle', 'cd-artifact', 990, 320, 160, 80, '制品库', '#b28cff'),
      shape('rectangle', 'cd-deploy', 1290, 320, 160, 80, '部署', '#2dd4bf'),
      shape('rectangle', 'cd-monitor', 1590, 320, 160, 80, '线上监控', '#57d68f'),

      arrow(240, 360, '#57d68f', 'cd-commit', 'cd-build', 2, 1600),
      arrow(540, 360, '#6ea8ff', 'cd-build', 'cd-test', 2, 1800),
      arrow(680, 360, '#ff7a7a', 'cd-test', 'cd-build', 1, 2600), // 失败回环
      arrow(860, 360, '#ffb454', 'cd-test', 'cd-artifact', 3, 2000), // 通过
      arrow(1150, 360, '#b28cff', 'cd-artifact', 'cd-deploy', 2, 1800),
      arrow(1450, 360, '#2dd4bf', 'cd-deploy', 'cd-monitor', 2, 1600),
    ],
  ),

  // ---------------------------------------------------------------- approval
  // 发起 → 一级审批 → 二级审批(菱形) →通过→ 归档；驳回以慢速橙边折返发起
  define(
    'approval',
    '审批流',
    '二级审批通过后紫线三包快速归档，驳回则单枚橙包沿 2800ms 慢速长路折返发起人重新修改。',
    [
      shape('rectangle', 'ap-start', 80, 320, 160, 80, '发起申请', '#57d68f'),
      shape('rectangle', 'ap-l1', 380, 320, 160, 80, '一级审批', '#6ea8ff'),
      shape('diamond', 'ap-l2', 680, 290, 180, 140, '二级审批', '#ffb454'),
      shape('rectangle', 'ap-archive', 990, 320, 160, 80, '归档', '#b28cff'),

      arrow(240, 360, '#57d68f', 'ap-start', 'ap-l1', 2, 1600),
      arrow(540, 360, '#6ea8ff', 'ap-l1', 'ap-l2', 2, 2000),
      arrow(860, 360, '#b28cff', 'ap-l2', 'ap-archive', 3, 1800), // 通过
      arrow(680, 360, '#ffb454', 'ap-l2', 'ap-start', 1, 2800), // 驳回：慢速橙边
    ],
  ),
]

export const DEFAULT_TEMPLATE_ID = 'micro-service'
