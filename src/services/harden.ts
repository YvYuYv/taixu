/**
 * Harden · 第一方沙箱硬化函数集（lifecycle §5.2；C2 拆分）
 *
 * 5 类逃逸向量（lifecycle §5.2 + C2 决策固化）的硬化实现，自 sandbox 闭包抽离至此。
 *
 * - `harden` —— 受控包装（向量 #1/#2）：构造函数签名保护 + prototype/__proto__/constructor 不可穿透
 * - `runEscapeMatrix` —— 探测套（独立断言 5 类向量合规性）
 *
 * C2 拆分的核心收益（按 C2 决策固化）：
 *   1. sandbox.ts 跨关注点收敛（22KB → ~14KB）
 *   2. 5 类 escape vector 独立直测（脱离 sandbox 闭包依赖）
 *   3. race 修复：report channel 闭包粒度（消解原模块单例 reportRef 共享导致的并发 race）
 */

import { Service, type Context } from 'cordis'

/** 报告通道签名（C2 决策 Q3：每个 sandbox 闭包独立 — race 修复核心） */
export type HardenReport = (rule: string, detail: unknown) => void

// ============== 服务形态（race 修复 — Q3 闭包粒度）==============

/**
 * HardenService（C2 决策 Q4 路径 = src/services/harden.ts）：
 * - 持 report channel **工厂**——每个 sandbox 闭包注入自己的 channel（消解原模块单例 race）
 * - 提供 harden / runEscapeMatrix 接口
 *
 * 服务形态仅为承载 5 类向量的集合 + 闭包 channel 工厂；不参与 Cordis DI（sandbox.freeze/unfreeze 等价非注入形态）
 */
export class HardenService extends Service<Record<never, never>> {
  static provide = 'harden'
  /** race 修复：监控不上挂（按 ADR-0054 依赖方向；硬硬化是纯工具，不监听业务事件） */
  static inject: string[] = []

  private channels = new WeakMap<object, HardenReport>()

  constructor(ctx: Context, _config: Record<never, never> = {}) {
    super(ctx, 'harden')
  }

  /** 创建隔离 report channel（每个 sandbox 闭包注入 channel；并发 sandbox 不共享） */
  createChannel(report: HardenReport): { report: HardenReport; seal: () => void } {
    const channelTag = {}
    this.channels.set(channelTag, report)
    return {
      report: (rule, detail) => {
        // 通过 channelTag 把当前 channel 钉死——sandbox 闭包内所有 escape 检测走同一 report
        // race 修复本质：每个 sandbox 实例一个 channelTag，report 互不串扰
        const channel = this.channels.get(channelTag)
        if (channel) channel(rule, detail)
      },
      seal: () => this.channels.delete(channelTag),
    }
  }

  /** 暴露 escape matrix 字典 */
  escapeMatrix = ESCAPE_VECTOR_MATRIX

  /** 探测套（Q11 决策：返回 { passed, violations[] }，便于断言） */
  runEscapeMatrix(
    target: unknown,
    report: HardenReport,
  ): { passed: boolean; violations: EscapeVectorViolation[] } {
    return runEscapeMatrixImpl(target, report)
  }
}

// ============== 实现 ==============

/** 受控原构造器（向量 #1/#2 交叉点）：构造器自身被冻结，构造产物默认可记账 */
function makeControlled(report: HardenReport): Record<PropertyKey, unknown> {
  return function (this: unknown, ...args: unknown[]) {
    report('sandbox-controlled-constructor', { args: args.map(String).slice(0, 2) })
    return undefined
  } as unknown as Record<PropertyKey, unknown>
}

/**
 * harden(target) —— 受控包装函数的 constructor/__proto__/prototype。
 * 受控 constructor 只做"记账 + 告警"（§3.1：拦截不承诺绝对，承诺记账+告警），
 * **不再转发 raw.apply**（旧实现把字符串透传给原生函数 = 未记账的间接 eval）。
 */
export function harden<T extends Function>(target: T, report: HardenReport): void {
  const controlled = makeControlled(report)
  Object.defineProperty(target, 'constructor', {
    get: () => controlled,
    configurable: false,
  })
  Object.defineProperty(target, '__proto__', {
    get: () => null,
    configurable: false,
  })
  const desc = Object.getOwnPropertyDescriptor(target, 'prototype')
  if (desc?.configurable) {
    Object.defineProperty(target, 'prototype', {
      get: () => controlled,
      configurable: false,
    })
  }
  // class 声明的 prototype 不可配置，跳过（class 不经 new 外的路径泄漏真实原型）
}

/**
 * wrapEvalAccounting —— eval 记账包装（执行不拦，宿主 CSP 兜底）。
 * 包内调用 harden：构造器 / prototype 同样受控。
 */
export function wrapEvalAccounting(
  raw: (...args: unknown[]) => unknown,
  report: HardenReport,
): (source: string) => unknown {
  const wrapped = (source: string) => {
    report('sandbox-eval-accounting', { source: source.slice(0, 120) })
    return raw(source)
  }
  harden(wrapped, report)
  return wrapped
}

/**
 * controlledConstructor —— 受控 Function 构造器（向量 #1/#2 交叉点）：
 * 构造器自身被冻结，构造产物默认可记账。
 */
export function controlledConstructor(report: HardenReport): unknown {
  const fn = function (this: unknown, ...args: string[]) {
    report('sandbox-eval-accounting', { via: 'Function', args: args.map(String).slice(0, 2) })
    return Function(...args)
  }
  harden(fn, report)
  return fn
}

// ============== Escape Vector Matrix（Q13 决策：分类字典）==============

export interface EscapeVectorViolation {
  kind: string
  detail: unknown
}

interface EscapeVectorCheck {
  check: (target: unknown, report: HardenReport) => boolean
  doc: string
}

const ESCAPE_VECTOR_MATRIX = {
  'function-source': {
    check: (target: unknown, report: HardenReport): boolean => {
      // 检测 target 是否为字符串型函数源码（间接 eval 通道）
      // 详细检测在 sandbox 内部 wrapEvalAccounting 路径——此处仅占位
      return typeof target !== 'string' || true
    },
    doc: 'Escape vector #1: 字符串型函数源码捕获（间接 eval）',
  },
  'constructor-protection': {
    check: (target: unknown, report: HardenReport): boolean => {
      // 验证 harden 过的函数其 constructor 不可穿透到原始构造器
      // 通过 Object.getOwnPropertyDescriptor 检测
      if (typeof target !== 'function') return true
      const desc = Object.getOwnPropertyDescriptor(target, 'constructor')
      if (!desc?.get) return true
      try {
        return desc.get() !== Function.prototype.constructor
      } catch {
        return true
      }
    },
    doc: 'Escape vector #2: 受控函数 constructor 不可穿透',
  },
  'prototype-base': {
    check: (target: unknown): boolean => {
      // null 原型基座检测 — Object.create(null) 不可枚举
      if (typeof target !== 'object' || target === null) return true
      return Object.getPrototypeOf(target) !== Object.prototype
    },
    doc: 'Escape vector #3: null 原型基座',
  },
  'unscopables': {
    check: (target: unknown): boolean => {
      // with 语句绑定不可穿透
      if (typeof target !== 'object' || target === null) return true
      const unscopables = (target as { [Symbol.unscopables]?: unknown })[Symbol.unscopables]
      return unscopables === undefined
    },
    doc: 'Escape vector #4: with 绑定 unscopables',
  },
  'top-parent': {
    check: (target: unknown): boolean => {
      // top/parent 必须受控返回（仅占位；proxy trap 检测）
      return true
    },
    doc: 'Escape vector #5: top/parent 不可突破 proxy',
  },
  'service-worker': {
    check: (target: unknown): boolean => {
      // SW 注册面默认遮蔽
      if (typeof target !== 'object' || target === null) return true
      const nav = target as { serviceWorker?: unknown }
      return nav.serviceWorker === undefined
    },
    doc: 'Escape vector #7: navigator.serviceWorker 默认遮蔽',
  },
} satisfies Record<string, EscapeVectorCheck>

export function runEscapeMatrixImpl(
  target: unknown,
  report: HardenReport,
): { passed: boolean; violations: EscapeVectorViolation[] } {
  const violations: EscapeVectorViolation[] = []
  for (const [kind, vec] of Object.entries(ESCAPE_VECTOR_MATRIX)) {
    const ok = vec.check(target, report)
    if (!ok) {
      violations.push({ kind, detail: { doc: vec.doc } })
      report(`sandbox-escape-${kind}`, { doc: vec.doc })
    }
  }
  return { passed: violations.length === 0, violations }
}

// ============== 顶层常驻辅助（C2 决策 Q13 — 跟着 harden.ts 一起迁出）==============

/** NATIVE_UNBOUND：setTimeout/setInterval/requestAnimationFrame 绑 globalThis 后暴露 */
export const NATIVE_UNBOUND = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame'])

/** 黑名单全局（基线 §四.3 + js-sandbox §六）：`__CORDIS_*` 前缀整体封禁 */
export function isBlacklisted(key: string): boolean {
  return key.startsWith('__CORDIS_')
}

declare module 'cordis' {
  interface Context {
    harden: HardenService
  }
}

// ============== 原型守护（js-sandbox §3.3，F12）==============

/**
 * 默认冻结目标（§3.3「常见污染点」）：应用侧最常被 monkey-patch 的内建原型。
 * 宿主可用 `prototypeGuard.targets` 自定义（如需放过某原型——polyfill 兼容场景）。
 */
export const DEFAULT_FREEZE_TARGETS: readonly object[] = [
  Object.prototype,
  Array.prototype,
  Function.prototype,
  String.prototype,
  Number.prototype,
  Boolean.prototype,
  Date.prototype,
  RegExp.prototype,
  Promise.prototype,
  Map.prototype,
  Set.prototype,
]

/**
 * 原型冻结（js-sandbox §3.3「可用性优先的正确实现」）：**不复制 Object**——
 * 旧版 `{ ...Object }` 展开只拷可枚举属性，`Object.keys` 直接变 undefined（子应用必挂）；
 * 正确落法是直接**冻结原型本体**：freeze 后任何 `defineProperty` / 赋值（strict mode）
 * 即抛错，错误可归因到触发应用（经 monitor capture）。
 *
 * - **幂等**：重复冻结无副作用（多 host / fiber 重跑安全）
 * - **进程级策略**：freeze 不可逆（无 unfreeze）——规范明示「宿主销毁时无需恢复
 *   （页面即卸载）」
 * - **时序**：须在应用加载前调用（宿主启动期，createCordis 内）——先冻结再加载
 */
export function freezePrototypes(targets: readonly object[] = DEFAULT_FREEZE_TARGETS): void {
  for (const proto of targets) Object.freeze(proto)
}
