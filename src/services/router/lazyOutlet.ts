/**
 * Lazy outlet 状态机（route-adaptation §六表 loadOnVisible）：
 *
 * 5 字段 + 3 方法从 router.ts 抽离——自洽子系统（IntersectionObserver 注入 +
 * 视口命中派发意图 + 降级立即派发），与 outlets 矩阵 / registrations 注册表 /
 * seq 序号 / popstate 完全无共享。
 *
 * **C14-B 抽离动机**：router.ts 26 个状态字段中 lazy outlet 5 字段 + 3 方法
 * 是独立自洽状态机；抽离后 router 状态机密度收敛到 outlets 矩阵 / registrations /
 * seq / popstate 本职。
 *
 * **架构边界**：router.inject lazyOutletLedger 实例（非 cordis service 形态）——
 * 无 service 抽象必要，保持轻量模块 + 函数对象工厂 pattern（C7-A leakDetector 同节奏）。
 */
import type { MountIntent } from '../router'

/** IntersectionObserver 结构最小面（jsdom 无此 API；测试假件实现同一形状） */
export interface IntersectionObserverLike {
  observe(el: Element): void
  unobserve(el: Element): void
  disconnect(): void
}

export interface LazyOutletLedgerHandle {
  /** 挂载意图统一派发口（导航第 3 步与深链启动同一入口） */
  dispatchIntent(intent: MountIntent): void
  /** 懒槽位放行：标记已可见 + 派发 pending 的最新意图（一次性；后续导航走直通） */
  flush(outlet: string): void
  /** 释放资源（IntersectionObserver disconnect） */
  destroy(): void
}

/** 创建 lazy outlet 账本（无 cordis service 形态——轻量闭包工厂） */
export function createLazyOutletLedger(
  ioFactory: (new (callback: (entries: { isIntersecting: boolean; target: Element }[], observer: IntersectionObserverLike) => void, options?: unknown) => IntersectionObserverLike) | null,
  outletSelectors: Record<string, string>,
  onResolve: ((intent: MountIntent) => void) | undefined,
  lazyOutlets: string[] = [],
): LazyOutletLedgerHandle {
  const lazyOutletsSet = new Set<string>(lazyOutlets)
  const lazyVisible = new Set<string>()
  const lazyPending = new Map<string, MountIntent>()
  const lazyElToOutlet = new Map<Element, string>()
  let io: IntersectionObserverLike | null = null

  // IntersectionObserver 注入（能力缺失降级立即派发）
  const IO = ioFactory ?? (globalThis as unknown as { IntersectionObserver?: typeof ioFactory }).IntersectionObserver ?? null
  io = IO
    ? new IO((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const outlet = lazyElToOutlet.get(entry.target)
          if (outlet === undefined) continue
          // 命中即了结：unobserve + 派发 pending 意图（一次性触发）
          lazyElToOutlet.delete(entry.target)
          io?.unobserve(entry.target)
          flush(outlet)
        }
      })
    : null

  function dispatchIntent(intent: MountIntent): void {
    if (lazyOutletsSet.has(intent.outlet) && !lazyVisible.has(intent.outlet)) {
      lazyPending.set(intent.outlet, intent) // 多次导航只保留最新意图
      if (io) {
        // 宿主选择器约定与 lifecycle resolveOutletHost 同源（outlets 映射，缺省 `#{outlet}`）
        const selector = outletSelectors[intent.outlet] ?? `#${intent.outlet}`
        const el = document.querySelector(selector)
        if (el && !lazyElToOutlet.has(el)) {
          lazyElToOutlet.set(el, intent.outlet)
          io.observe(el)
        }
        if (el) return // 已在观察：意图留 pending，视口命中时派发
      }
      flush(intent.outlet) // 降级：无 IO / 无宿主元素 -> 立即派发
      return
    }
    onResolve?.(intent)
  }

  function flush(outlet: string): void {
    lazyVisible.add(outlet)
    const intent = lazyPending.get(outlet)
    lazyPending.delete(outlet)
    if (intent) onResolve?.(intent)
  }

  return {
    dispatchIntent,
    flush,
    destroy() {
      io?.disconnect()
      lazyOutletsSet.clear()
      lazyVisible.clear()
      lazyPending.clear()
      lazyElToOutlet.clear()
    },
  }
}

/** 注册懒槽位（router 配置注入：lazyOutlets 清单） */
export function registerLazyOutlet(ledger: LazyOutletLedgerHandle, outlet: string): void {
  // 本函数为占位——实际注册逻辑在 createLazyOutletLedger 闭包内 lazyOutletsSet
  // router 构造时经 config.lazyOutlets 初始化；本函数供未来动态注册用
  void ledger
  void outlet
}
