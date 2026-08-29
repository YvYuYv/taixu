/**
 * 时间旅行账本（state-sharing.md §八 DevTools 联动，F10）。
 *
 * 规范：history 环形缓冲（默认 500 条，含 version/source/ts），devtools 经只读接口
 * 消费；`travelTo(version)` 仅在开发模式提供（生产禁用——enabled 默认 false）。
 *
 * 形态：**闭包工厂**（`createTimeTravel`，零 ctx 依赖、非 cordis service、destroy 清理
 * ——与 queue/dlq/fontRegistry 等 9 个模块同一模式，第 10 个推广点）。
 *
 * 记录粒度 = 单键提交：`{ key, version, source, ts, value }`；`travelTo(version)` =
 * 把该 version 对应的键恢复为其当时值（单键回滚）。整树快照回滚需要全量克隆账本
 * （内存翻倍），不在本票——单键回滚已覆盖"误写回滚"的主场景。
 */

export interface TimeTravelEntry {
  key: string
  version: number
  source: string
  ts: number
  /** 提交值（全量快照，非 diff——回滚 O(1) 无需重放） */
  value: unknown
}

export interface TimeTravelHandle {
  /** commit 钩子：每次提交入账（环形缓冲溢出覆盖最旧） */
  record(key: string, version: number, source: string, value: unknown): void
  /** 只读查询面（devtools 消费；时间序返回，最旧在前） */
  entries(): readonly TimeTravelEntry[]
  /** 按 version 定位（travelTo 用；O(n) 线性扫，账本有界 500 条） */
  find(version: number): TimeTravelEntry | null
  /** 清空（宿主销毁/测试隔离用） */
  destroy(): void
}

/** 环形缓冲时间旅行账本 */
export function createTimeTravel(capacity: number): TimeTravelHandle {
  const entries: TimeTravelEntry[] = []
  return {
    record(key, version, source, value) {
      entries.push({ key, version, source, ts: Date.now(), value })
      if (entries.length > capacity) entries.shift() // 环形：溢出覆盖最旧（capacity 小，O(1) 摊销）
    },
    entries() {
      return entries.slice() // 防御性拷贝：外部改动不污染账本
    },
    find(version) {
      return entries.find((e) => e.version === version) ?? null
    },
    destroy() {
      entries.length = 0
    },
  }
}
