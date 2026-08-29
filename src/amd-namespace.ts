/**
 * AMD per-app 命名空间（heterogeneous-loading.md §7.1，F6 子项）。
 *
 * 规范：legacy 路线中 AMD loader 经沙箱 **per-app 命名空间包装**（`__cordis_define__`），
 * 同名模块按 appId 隔离——两个 UMD 应用各自 `define('vue', ...)` 不再撞全局单例
 * （§八 window.Vue 污染的 AMD 变体）。
 *
 * 形态：零状态工厂（每应用一个命名空间），注册面由沙箱 legacy exec 路线接线
 * （`fakeWindow.define = ns.define`）；本模块不接触 DOM/cordis——纯模块（L0）。
 *
 * 支持 AMD 规范的常用子集：`define(name?, deps?, factory)`（具名/匿名、依赖声明、
 * 工厂返回值即模块）与 `require(deps, callback)`。
 */
export interface AmdNamespace {
  /** 沙箱注入名（per-app）；参数重载：define(factory) / define(name, factory) / define(deps, factory) */
  define: (
    name?: string | string[] | ((...args: unknown[]) => unknown),
    deps?: string[] | ((...args: unknown[]) => unknown),
    factory?: (...args: unknown[]) => unknown,
  ) => void
  require: (deps: string[], callback: (...mods: unknown[]) => void) => void
  /** 本命名空间已注册的模块（诊断面；键 = 模块名） */
  registry: Map<string, unknown>
}

/** AMD 依赖解析失败（循环/缺失）不静默——由宿主经 report 上报（fail-closed 可观测） */
export function createAmdNamespace(appId: string): AmdNamespace {
  const registry = new Map<string, unknown>()

  function define(
    name?: string | string[] | ((...args: unknown[]) => unknown),
    deps?: string[] | ((...args: unknown[]) => unknown),
    factory?: (...args: unknown[]) => unknown,
  ): void {
    // 参数重载归一：define(factory) / define(name, factory) / define(deps, factory)
    if (typeof name === 'function') {
      factory = name
      name = undefined
      deps = []
    } else if (typeof name === 'string' && typeof deps === 'function') {
      factory = deps
      deps = []
    } else if (Array.isArray(name)) {
      const arr = name
      const fn = deps
      name = undefined
      deps = arr
      factory = typeof fn === 'function' ? fn : undefined
    }
    if (typeof factory !== 'function') return // AMD 规范要求工厂；缺失即忽略（loader 语义）

    const resolved = ((deps as string[] | undefined) ?? []).map((dep) => {
      const mod = registry.get(dep)
      if (mod === undefined) {
        throw new Error(`amd: unresolved dependency "${dep}" in app "${appId}" (define order?)`)
      }
      return mod
    })
    const moduleValue = factory(...resolved)
    if (typeof name === 'string') {
      if (registry.has(name)) {
        // 同命名空间内重复注册 = 应用自身 bug（AMD loader 通常告警不覆盖）
        throw new Error(`amd: module "${name}" already defined in app "${appId}"`)
      }
      registry.set(name, moduleValue)
    }
    // 匿名模块：值只能经 require 回调消费，不入 registry（与 AMD 语义一致）
  }

  function require(deps: string[], callback: (...mods: unknown[]) => void): void {
    const mods = deps.map((dep) => {
      const mod = registry.get(dep)
      if (mod === undefined) {
        throw new Error(`amd: unresolved module "${dep}" in app "${appId}"`)
      }
      return mod
    })
    callback(...mods)
  }

  return { define, require, registry }
}
