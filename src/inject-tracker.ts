/**
 * 注入节点记账（js-sandbox §3.5 InjectedNodesTracker）：
 * 数据源是 document/head/body 代理层（见 document-proxy.ts），覆盖全部注入路径
 * （appendChild/insertBefore/append/prepend/replaceChildren/innerHTML/insertAdjacentHTML）；
 * 本模块只负责"记录/收割/移除"三件事，不改写真实 DOM。
 * 记账节点（style/script）供样式生命周期（04 号票登记语义）与 destroy 统一移除消费。
 *
 * C12-A：ReportFn 类型与 document-proxy 同源，统一定义在 sandbox-proxy-helpers.ts。
 */

import type { ReportFn } from './sandbox-proxy-helpers'

export class InjectedNodesTracker {
  private nodes = new Set<Element>()
  currentScript: HTMLScriptElement | null = null

  constructor(private reportFn: ReportFn = () => {}) {}

  reportViolation(rule: string, detail: unknown): void {
    this.reportFn(rule, detail)
  }

  /** 代理层注入路径调用时登记（appendChild/insertBefore/append/prepend/replaceChildren） */
  maybeRecord(node: Node): void {
    if (node instanceof HTMLStyleElement || node instanceof HTMLScriptElement) {
      this.nodes.add(node)
      if (node instanceof HTMLScriptElement) this.currentScript = node
    }
  }

  /** 解析后收割新增 style/script（innerHTML/insertAdjacentHTML 路径） */
  harvest(el: HTMLElement): void {
    for (const n of el.querySelectorAll('style, script')) {
      this.maybeRecord(n)
    }
  }

  nodesList(): Element[] {
    return [...this.nodes]
  }

  /** destroy 时统一移除**本应用**记账的节点（应用间互不干扰） */
  removeAll(): void {
    for (const n of this.nodes) n.remove()
    this.nodes.clear()
    this.currentScript = null
  }
}
