/**
 * Bus 挂起队列（§5.5，ADR-0008/0015/0021）：
 *
 * 挂起队列状态机（queues Map + replaying Set + enqueue）从 bus.ts 抽离——
 * 纯状态机（无 ctx 依赖），与实例注册 / 单播 dispatch / 广播 / 请求-应答 / pubLatest
 * 完全无共享。
 *
 * **C14-C 抽离动机**：bus.ts 16 个状态字段中挂起队列 3 字段 + enqueue 方法
 * 是独立自洽状态机；抽离后 bus 状态机密度收敛到实例注册 / 单播 dispatch / 广播本职。
 *
 * **架构边界**：bus.inject queueLedger 实例（非 cordis service 形态）——
 * 无 service 抽象必要，保持轻量模块 + 函数对象工厂 pattern（C7-A leakDetector 同节奏）。
 */
import type { CordisMessage } from '../../events'

export interface QueueEntry {
  items: CordisMessage[]
  coalesced: Set<string>
  dropped: number
}

export interface QueueLedgerHandle {
  /** 入队（§5.5）：上限 FIFO 丢最旧 + 同键合并（旧值移除、最新值入队尾） */
  enqueue(instanceId: string, message: CordisMessage, queueLimit: number): void
  /** 查询队列（replay 路径消费） */
  get(instanceId: string): QueueEntry | undefined
  /** 删除队列（app/disposed 清理） */
  delete(instanceId: string): void
  /** 回放中标记：期间新消息入队尾保持全序（ADR-0015） */
  isReplaying(instanceId: string): boolean
  /** 标记回放中（replay 路径调用） */
  markReplaying(instanceId: string): void
  /** 取消回放中标记（replay 完成） */
  unmarkReplaying(instanceId: string): void
  /** 全部实例 ID（replay 路径消费） */
  keys(): string[]
  /** 释放资源 */
  destroy(): void
}

/** 创建挂起队列账本（无 cordis service 形态——轻量闭包工厂） */
export function createQueueLedger(): QueueLedgerHandle {
  const queues = new Map<string, QueueEntry>()
  const replaying = new Set<string>()

  return {
    enqueue(instanceId, message, queueLimit) {
      const q = queues.get(instanceId) ?? { items: [], coalesced: new Set<string>(), dropped: 0 }
      if (q.items.length >= queueLimit) {
        q.items.shift() // FIFO 丢最旧
        q.dropped++
      }
      const key = message.metadata?.coalesceKey
      if (key) {
        // 同键合并（§5.5）：移除旧值后 push（入队序 = 时间序）；findLastIndex 需 ES2023，手写等价
        let prev = -1
        q.items.forEach((m, idx) => {
          if (m.metadata?.coalesceKey === key) prev = idx
        })
        if (prev >= 0) {
          q.items.splice(prev, 1)
          q.coalesced.add(key)
        }
      }
      q.items.push(message)
      queues.set(instanceId, q)
    },

    get(instanceId) {
      return queues.get(instanceId)
    },

    delete(instanceId) {
      queues.delete(instanceId)
      replaying.delete(instanceId)
    },

    isReplaying(instanceId) {
      return replaying.has(instanceId)
    },

    markReplaying(instanceId) {
      replaying.add(instanceId)
    },

    unmarkReplaying(instanceId) {
      replaying.delete(instanceId)
    },

    keys() {
      return [...queues.keys()]
    },

    destroy() {
      queues.clear()
      replaying.clear()
    },
  }
}
