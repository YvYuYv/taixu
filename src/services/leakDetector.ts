/**
 * Leak detector（monitoring §四，adv refactor C7-A）：可 WeakRef 对象的泄漏探测。
 *
 * - WeakRef + FinalizationRegistry 特性缺失时**整体降级为纯记账**（不抛错）
 * - `trackDisposed`：登记嫌疑（instanceId -> WeakRef<object>）；FinalizationRegistry
 *   在 GC 时自动洗清嫌疑
 * - `sweepOnce()`：外部定时调用——超 TTL 且期间有 GC 活动证据 + 引用仍活着 ->
 *   返回 suspect 列表（LEAK_SUSPECT 告警去抖由 monitor 维护 `leakReported`）
 * - `leakSuspects()`：只读视图（DevTools/上报出站源）
 *
 * **C7-A 抽离动机**：原 monitor.ts 同时承担错误/指标/告警/隔离门面 4 关注点 +
 *   leak detection 5 关注点；leak 检测自洽——无 ctx 依赖、无 trigger 依赖（返回
 *   suspect 列表由 monitor.trigger 派发告警）。抽离后 monitor 责任面收敛到
 *   错误/指标/告警/隔离门面本职。
 *
 * **架构边界**：monitor.inject leak detector 实例（非 cordis service 形态）——
 *   leak 模块无 service 抽象必要，保持轻量模块 + 函数对象工厂 pattern。
 */
export interface LeakConfig {
  /** 嫌疑 TTL ms（默认 60000）；超 TTL + GC 活动 + 引用仍活 -> suspect */
  ttlMs?: number
  /** GC 活动证据源（测试/宿主可注入；默认 = performance.memory 堆下降事件） */
  hasGcActivity?: () => boolean
}

export interface LeakSuspectEntry {
  instanceId: string
  at: number
}

export interface LeakDetectorHandle {
  /** 登记嫌疑（dispose 后由 lifecycle 调用）；特性缺失时 noop */
  trackDisposed(target: { instanceId: string; object: object }): void
  /** 只读视图（DevTools / 上报出站） */
  leakSuspects(): LeakSuspectEntry[]
  /** 单次清扫——返回超 TTL + GC 活动 + 引用仍活的嫌疑（供 monitor.trigger LEAK_SUSPECT 用） */
  sweepOnce(): LeakSuspectEntry[]
  /** 释放资源（定时器由调用方管理；本模块无内置轮询——保持"模块纯函数化"风格） */
  destroy(): void
}

/**
 * GC 活动证据（monitoring §四）：performance.memory 下降事件（无此 API = 无证据 -> 不告警，诚实降级）
 * ——监控堆下降能侧面证明"期间确实发生过 GC"（不是绝对证据但足够去伪）。
 */
function observeHeapDecline(state: { lastHeap: number | undefined }): () => boolean {
  return () => {
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
    if (!mem) return false
    if (state.lastHeap !== undefined && mem.usedJSHeapSize < state.lastHeap) {
      state.lastHeap = mem.usedJSHeapSize
      return true // 发生过 GC（堆下降）
    }
    state.lastHeap = mem.usedJSHeapSize
    return false
  }
}

/** 创建 leak detector（无 cordis service 形态——轻量闭包工厂） */
export function createLeakDetector(config: LeakConfig = {}): LeakDetectorHandle {
  // 特性检测（monitoring §四）：WeakRef/FinalizationRegistry 缺失则降级为纯记账（不抛错）
  const leakSupported =
    typeof WeakRef === 'function' && typeof FinalizationRegistry === 'function'
  /** 嫌疑（§四）：instanceId -> { ref, at }；Registry 回调确认即移出 */
  const suspects = new Map<string, { ref: WeakRef<object>; at: number }>()
  /** 告警去抖（monitor 维护，模块不持有——sweepOnce 返回 suspect 列表，monitor 决定是否 trigger） */
  const heapState: { lastHeap: number | undefined } = { lastHeap: undefined }
  const gcActivity = config.hasGcActivity ?? observeHeapDecline(heapState)

  let registry: FinalizationRegistry<string> | undefined
  if (leakSupported) {
    registry = new FinalizationRegistry((key: string) => {
      suspects.delete(key) // 回收确认：被 GC -> 移出嫌疑（修复 deref 误报）
    })
  }

  return {
    trackDisposed(target) {
      if (!leakSupported) return // 特性降级：不探测（检测插件自身不抛错）
      suspects.set(target.instanceId, {
        ref: new WeakRef(target.object),
        at: Date.now(),
      })
      registry?.register(target.object, target.instanceId)
    },

    leakSuspects() {
      return [...suspects].map(([instanceId, s]) => ({ instanceId, at: s.at }))
    },

    sweepOnce() {
      const found: LeakSuspectEntry[] = []
      const ttlMs = config.ttlMs ?? 60_000
      const now = Date.now()
      for (const [key, s] of [...suspects]) {
        if (s.ref.deref() === undefined) {
          suspects.delete(key) // 已回收（Registry 回调之外的兜底）
          continue
        }
        if (now - s.at > ttlMs && gcActivity()) {
          found.push({ instanceId: key, at: s.at })
          suspects.delete(key)
        }
      }
      return found
    },

    destroy() {
      suspects.clear()
      // registry 引用释放由 GC 自行处理
    },
  }
}
