/**
 * DevTools 服务（monitoring §十 联动，P1）+ HMR 服务（lifecycle §5.5 ADR-0037，A4）。
 *
 * - devtools **复用**各服务既有采集/查询面（唯一数据源——不重复注册采集循环）；
 *   只读聚合 snapshot() + 命令通道 execute()（宿主级调用面，root 权限语义）
 * - HmrService：
 *   - cssUpdate：css-only 热替换（style-isolation §七——style 节点替换 textContent /
 *     Constructable 走 replaceSync，目标节点找不到即显式错误）
 *   - fullReload：应用 fiber 重跑（cordis reactive coeffect：effect 回滚后重新执行 =
 *     HMR 全量重启语义）；state local: 键空间在 root 服务持久——重跑自动暖启动
 *     （快照/注水路径 ADR-0037 为驱逐（dispose）场景，fiber 重跑不经 dispose）
 * - 面板 UI 与 Vite 集成（构建侧 externals/注入）在运行时之外——本服务提供其数据与命令面
 */
import { Service, type Context } from 'cordis'
import '../events'

/** 只读聚合快照（§十：指标/错误/泄漏嫌疑/实例/DLQ/字体 registry） */
/** 样式冲突条目（style-isolation §八 冲突检测，F7）：同一选择器命中多个应用的 DOM */
export interface StyleConflict {
  /** 命中的选择器文本 */
  selector: string
  /** 命中元素归属的应用 appId（去重，>1 即跨应用冲突） */
  apps: string[]
  /** 命中元素总数 */
  hitCount: number
}

export interface DevToolsSnapshot {
  instances: { appId: string; instanceId: string; state: string }[]
  metrics: Record<string, { count: number; p50: number; p75: number; p95: number; max: number }>
  spans: number
  deadLetters: readonly import('./bus').DeadLetterRecord[]
  errors: { message: string; appId?: string; phase: string; stack?: string }[]
  leakSuspects: { instanceId: string; at: number }[]
  fonts: { family: string; refs: number }[]
}

/** 命令通道载荷（deny-by-default：未支持的命令显式拒绝） */
export type DevToolsCommand =
  | { type: 'instance/destroy'; instanceId: string }
  | { type: 'instance/suspend'; instanceId: string }
  | { type: 'instance/resume'; instanceId: string }
  | { type: 'dlq/replay'; index: number }
  | { type: 'killswitch/disable'; appId: string; reason: string; signature: string }

export interface DevToolsConfig {}

export class DevToolsService extends Service<DevToolsConfig> {
  static provide = 'devtools'

  constructor(ctx: Context, _config: DevToolsConfig = {}) {
    super(ctx, 'devtools')
  }

  static inject = ['lifecycle', 'monitor', 'bus', 'style', 'security'] // security 显式注入（fail-closed，ADR-0009：命令通道含 killswitch 转发）

  /** 只读聚合（§十：复用各服务查询面——唯一数据源，无第二套采集） */
  snapshot(): DevToolsSnapshot {
    return {
      instances: this.ctx.lifecycle.getInstances().map((i) => ({
        appId: i.appId,
        instanceId: i.instanceId,
        state: this.ctx.lifecycle.getAppState(i.instanceId),
      })),
      metrics: this.ctx.monitor.metricsSnapshot(),
      spans: this.spansOf(),
      deadLetters: this.ctx.bus.deadLetters(),
      // stack 直出（monitoring §二 F4）：capture 入库前已过 sourcemap 管线还原，
      // devtools 复用同一结果（唯一数据源，不二次重写）
      errors: this.ctx.monitor
        .errors()
        .map((e) => ({ message: e.message, appId: e.appId, phase: e.phase, stack: e.stack })),
      leakSuspects: this.ctx.monitor.leakSuspects(),
      fonts: this.ctx.style.fontRegistryEntries().map((e) => ({ family: e.family, refs: e.refs })),
    }
  }

  /**
   * 样式冲突检测（style-isolation §八，F7）：**开发模式**扫描文档级样式规则，
   * 统计每个选择器命中元素归属的应用——同一选择器命中 ≥2 个应用 = 跨应用样式泄漏
   * （无 Shadow 隔离的文档级样式的典型症状）。
   *
   * - 只读、无副作用；O(规则数 × 命中元素数)，**只在开发/诊断路径调用**（不进运行时热路径）
   * - 跨源 stylesheet（`cssRules` 抛 SecurityError）跳过——不因不可读而整体失败
   * - `@media`/`@supports`/`@layer` 等分组规则**递归下探**（组内规则才是命中来源）
   */
  scanStyleConflicts(): StyleConflict[] {
    const instances = this.ctx.lifecycle
      .getInstances()
      .map((i) => ({ appId: i.appId, container: i.container }))
      .filter((i): i is { appId: string; container: HTMLElement } => i.container instanceof HTMLElement)
    if (instances.length === 0) return []

    const out: StyleConflict[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules // 跨源 sheet 不可读（SecurityError）——跳过
      } catch {
        continue
      }
      for (const rule of Array.from(rules)) this.collectConflicts(rule, instances, out)
    }
    return out
  }

  /** 规则递归（分组规则下探；普通样式规则做命中归属统计） */
  private collectConflicts(
    rule: CSSRule,
    instances: { appId: string; container: HTMLElement }[],
    out: StyleConflict[],
  ): void {
    const grouping = rule as CSSGroupingRule
    if (typeof grouping.cssRules === 'object' && grouping.cssRules !== null && 'conditionText' in rule) {
      for (const child of Array.from(grouping.cssRules)) this.collectConflicts(child, instances, out)
      return
    }
    const styleRule = rule as CSSStyleRule
    if (typeof styleRule.selectorText !== 'string' || styleRule.selectorText === '') return

    let nodes: NodeListOf<Element>
    try {
      nodes = document.querySelectorAll(styleRule.selectorText)
    } catch {
      return // 非法选择器（宿主未知语法/浏览器不支持）：跳过，不阻断扫描
    }
    if (nodes.length === 0) return

    const apps = new Set<string>()
    for (const el of Array.from(nodes)) {
      const owner = instances.find((i) => i.container.contains(el))
      if (owner) apps.add(owner.appId)
    }
    if (apps.size > 1) {
      out.push({ selector: styleRule.selectorText, apps: [...apps].sort(), hitCount: nodes.length })
    }
  }

  /** 命令通道（宿主级：面板操作转发到各服务既有入口——不发明旁路） */
  async execute(command: DevToolsCommand): Promise<unknown> {
    switch (command.type) {
      case 'instance/destroy':
        return this.ctx.lifecycle.destroy(command.instanceId, 'devtools')
      case 'instance/suspend':
        return this.ctx.lifecycle.requestSuspend(this.ctx, command.instanceId, 'system', 'command')
      case 'instance/resume':
        return this.ctx.lifecycle.requestResume(this.ctx, command.instanceId, 'route')
      case 'dlq/replay':
        return this.ctx.bus.replayDeadLetter(command.index)
      case 'killswitch/disable':
        return this.ctx.security.disableApp(command.appId, command.reason, command.signature)
      default: {
        // 穷举守卫：新增命令类型未处理 = 显式拒绝（deny-by-default）
        const exhaust: never = command
        throw new Error(`devtools: unsupported command ${JSON.stringify(exhaust as unknown)}`)
      }
    }
  }

  /** tracing 懒取（span 计数；devtools 不 inject tracing——ADR-0054 方向） */
  private spansOf(): number {
    try {
      return ((this.ctx as Context & { tracing?: { spans(): unknown[] } }).tracing?.spans().length) ?? 0
    } catch {
      return 0
    }
  }
}

/** HMR 载荷：css-only 更新（style-isolation §七） */
export interface HmrCssUpdate {
  appId: string
  file: string
  css: string
}

export interface HmrConfig {}

export class HmrService extends Service<HmrConfig> {
  static provide = 'hmr'

  constructor(ctx: Context, _config: HmrConfig = {}) {
    super(ctx, 'hmr')
  }

  static inject = ['lifecycle', 'style']

  /**
   * css-only 热替换（§七）：style 节点替换 textContent（注入时已统一打标
   * data-cordis-app + data-file——修复旧版 link 节点用 style 选择器查询找不到目标）；
   * Shadow 路线 Constructable 由 style 服务同 file 重注入语义覆盖（replaceSync）。
   * 目标不存在 = 显式错误（旧版静默跳过后旧样式残留）。
   */
  cssUpdate(update: HmrCssUpdate): void {
    const target = document.querySelector<HTMLStyleElement>(
      `style[data-cordis-app="${update.appId}"][data-file="${update.file}"]`,
    )
    if (target) {
      target.textContent = update.css
      return
    }
    // link 路线（§七）：换 href 带 cache-busting query
    const link = document.querySelector<HTMLLinkElement>(
      `link[data-cordis-app="${update.appId}"][data-file="${update.file}"]`,
    )
    if (link) {
      const base = link.href.split('?')[0]!
      link.href = `${base}?t=${Date.now()}`
      return
    }
    // Shadow 路线：经 style 服务同 file 重注入（constructable replaceSync /
    // shadow 内节点替换文本）——需该应用活实例的 ctx 归因
    const instance = this.ctx.lifecycle.getInstances().find((i) => i.appId === update.appId)
    if (instance) {
      this.ctx.style.inject(instance.ctx, { file: update.file, css: update.css })
      return
    }
    throw new Error(`hmr: no style target for ${update.appId}/${update.file} (node missing and no live instance)`)
  }

  /**
   * 全量重启（ADR-0007/0037）：fiber 重跑——cordis reactive coeffect 语义下
   * 旧 effect 回滚后重新执行（整应用重挂载，非原位热替换）。ADR-0037 的
   * 快照/注水是**驱逐（dispose 状态全丢）**路径；fiber 重跑不经 dispose——
   * local: 键空间挂在 root state 服务（ADR-0023/0033）持久，重跑自动暖启动
   *（同实例同键空间，无注水必要）。
   */
  async fullReload(instanceId: string): Promise<void> {
    const instance = this.ctx.lifecycle.getInstances().find((i) => i.instanceId === instanceId)
    if (!instance) throw new Error(`hmr: no instance ${instanceId}`)
    await instance.fiber.restart()
  }
}

declare module 'cordis' {
  interface Context {
    devtools: DevToolsService
    hmr: HmrService
  }
}
