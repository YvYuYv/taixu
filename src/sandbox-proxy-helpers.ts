/**
 * Document-proxy helpers（js-sandbox §3.5，DocumentProxy 工厂使用的常量与工具）。
 *
 * 4 个 helper/常量从 document-proxy.ts 顶层抽离——零依赖（不接触 ctx/inspector）。
 *
 * **C12-A 抽离动机**：原 document-proxy.ts 201 行顶层 helpers（INJECT_METHODS /
 *   DOM_QUERY_KEYS / cssEscape / ReportFn 类型）与类本体混在一起；helpers 抽离后
 *   DocumentProxy 类本体聚焦 DOM 代理逻辑，helpers 可独立单测。
 */

/** head/body 代理拦截的注入方法集（记账语义在 get trap 内联） */
export const INJECT_METHODS = new Set([
  'appendChild',
  'insertBefore',
  'append',
  'prepend',
  'replaceChildren',
])

/** DOM 查询键（scoped 语义适用集；与 scoped() 分支一一对应） */
export const DOM_QUERY_KEYS = new Set([
  'getElementById',
  'querySelector',
  'querySelectorAll',
  'getElementsByClassName',
  'getElementsByTagName',
])

/** 报表回调（document-proxy + inject-tracker 复用类型，避免重复定义） */
export type ReportFn = (rule: string, detail: unknown) => void

/**
 * CSS 属性选择器转义（js-sandbox §3.5）：CSS.escape 不可用时退化实现。
 * 与 native CSS.escape 行为一致——对 id 中含引号/特殊字符的安全转义。
 */
export function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"')
}
