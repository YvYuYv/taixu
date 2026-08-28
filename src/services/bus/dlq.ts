/**
 * Bus DLQ 死信账本（§5.4/§5.2：不可达目标不静默丢弃，可审计可重放）：
 *
 * 死信账本（dlq Array + deadLetter + deadLetters）从 bus.ts 抽离——
 * 纯账本（无 ctx 依赖），与挂起队列 / 实例注册 / 单播 dispatch 完全无共享。
 *
 * **C14-C 抽离动机**：bus.ts 16 个状态字段中 DLQ 1 字段 + 3 方法
 * 是独立自洽账本；抽离后 bus 状态机密度收敛到实例注册 / 单播 dispatch / 广播本职。
 *
 * **架构边界**：bus.inject dlqLedger 实例（非 cordis service 形态）——
 * 无 service 抽象必要，保持轻量模块 + 函数对象工厂 pattern（C7-A leakDetector 同节奏）。
 */
import type { CordisMessage } from '../../events'

/** 死信记录（§5.4：不可达目标不静默丢弃，可审计可重放） */
export interface DeadLetterRecord {
  message: CordisMessage
  error: string
  at: number
}

export interface DlqLedgerHandle {
  /** 死信入队：有界（默认 100，溢出丢最旧） */
  push(message: CordisMessage, error: string, dlqLimit: number): void
  /** DLQ 只读视图（devtools/宿主审计用） */
  entries(): readonly DeadLetterRecord[]
  /** 按索引查询（replayDeadLetter 路径消费） */
  at(index: number): DeadLetterRecord | undefined
  /** 按索引移除（replayDeadLetter 成功投递后） */
  removeAt(index: number): void
  /** 释放资源 */
  destroy(): void
}

/** 创建 DLQ 死信账本（无 cordis service 形态——轻量闭包工厂） */
export function createDlqLedger(): DlqLedgerHandle {
  const dlq: DeadLetterRecord[] = []

  return {
    push(message, error, dlqLimit) {
      dlq.push({ message, error, at: Date.now() })
      if (dlq.length > dlqLimit) dlq.shift() // 有界：丢最旧（§5.2）
    },

    entries() {
      return dlq
    },

    at(index) {
      return dlq[index]
    },

    removeAt(index) {
      dlq.splice(index, 1)
    },

    destroy() {
      dlq.length = 0
    },
  }
}
