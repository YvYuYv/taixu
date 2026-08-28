/**
 * 依赖方向机器校验（C16-B，ADR-0054 / ADR-0009 / 基线 §2.2）：
 *
 * 各服务的 `static inject` 声明构成运行时依赖图。ADR-0054 要求依赖方向单向
 * （monitor / security 零业务依赖、最先可用），但此前依赖图无自动化校验——
 * 未来有人给 monitor 加 `inject = ['security']` 即成环，且不会被测试捕获。
 *
 * 本测试把依赖方向固化为机器校验：
 *
 * 1. **无环（DAG）**：依赖图可拓扑排序——任何循环注入即红灯
 * 2. **monitor / security 零业务依赖**：ADR-0054「零业务依赖、最先可用」——
 *    二者必须保持叶子节点（否则核心层启动顺序失效）
 * 3. **核心八服务不反向依赖 devtools**：devtools 是诊断工具层（非核心），
 *    核心层反向依赖即把诊断耦合进运行时主路径
 *
 * 为什么是测试而不是文档：依赖环在 Cordis 运行时表现为"注入 undefined"或
 * 启动死锁，症状与根因距离远。本测试在静态层直接捕获。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const SERVICES_DIR = join(process.cwd(), 'src', 'services')

/** 核心八服务（基线 §2.2 / ADR-0011） */
const CORE_SERVICES = ['lifecycle', 'router', 'bus', 'state', 'sandbox', 'monitor', 'security', 'deps']
/** 零业务依赖叶子（ADR-0054） */
const ZERO_DEPENDENCY = ['monitor', 'security']

interface ServiceDecl {
  provide: string
  inject: string[]
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
  })
}

/**
 * 提取服务声明：每个 `static provide = 'x'` 之后（下一个 provide 之前）最近的
 * `static inject = [...]`。同文件多服务（devtools.ts 的 DevTools + Hmr）各自成条。
 */
function parseServices(src: string): ServiceDecl[] {
  const out: ServiceDecl[] = []
  const provideRe = /static\s+provide\s*=\s*'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = provideRe.exec(src)) !== null) {
    const provide = m[1] as string
    // 从 provide 位置到下一个 provide（或文末）的区间内找 inject
    const nextIdx = src.indexOf('static provide', provideRe.lastIndex)
    const segment = src.slice(m.index, nextIdx === -1 ? src.length : nextIdx)
    const injectMatch = segment.match(/static\s+inject(?:\s*:\s*[^=]+)?\s*=\s*\[([^\]]*)\]/)
    const inject = injectMatch?.[1]
      ? [...injectMatch[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string)
      : []
    out.push({ provide, inject })
  }
  return out
}

/** Kahn 拓扑排序；返回 null 表示有环 */
function topoSort(nodes: Set<string>, edges: Map<string, string[]>): string[] | null {
  const indeg = new Map<string, number>()
  for (const n of nodes) indeg.set(n, 0)
  for (const [, deps] of edges) {
    for (const d of deps) if (nodes.has(d)) indeg.set(d, (indeg.get(d) ?? 0) + 1)
  }
  const queue = [...nodes].filter((n) => (indeg.get(n) ?? 0) === 0)
  const order: string[] = []
  while (queue.length) {
    const n = queue.shift() as string
    order.push(n)
    for (const d of edges.get(n) ?? []) {
      if (!nodes.has(d)) continue
      const next = (indeg.get(d) ?? 0) - 1
      indeg.set(d, next)
      if (next === 0) queue.push(d)
    }
  }
  return order.length === nodes.size ? order : null
}

describe('依赖方向机器校验（ADR-0054 依赖单向 / ADR-0011 核心层）', () => {
  const decls: ServiceDecl[] = []
  for (const file of walk(SERVICES_DIR)) {
    decls.push(...parseServices(readFileSync(file, 'utf8')))
  }
  const byName = new Map(decls.map((d) => [d.provide, d]))
  // 依赖图节点：声明的服务 + 被 inject 引用到的服务（含 cordis 内置）
  const nodes = new Set<string>(decls.map((d) => d.provide))
  const edges = new Map<string, string[]>()
  for (const d of decls) {
    edges.set(d.provide, d.inject)
    for (const dep of d.inject) nodes.add(dep)
  }

  it('提取到服务声明（非空依赖图）', () => {
    expect(decls.length).toBeGreaterThan(0)
    expect(byName.has('lifecycle')).toBe(true)
  })

  it('无环：服务依赖图可拓扑排序（无循环注入）', () => {
    const order = topoSort(nodes, edges)
    expect(
      order,
      `依赖图存在环（循环注入）——环内服务将在运行时注入 undefined 或启动死锁；节点: ${[...nodes].join(', ')}`,
    ).not.toBeNull()
  })

  it('零业务依赖叶子：monitor / security 不 inject 任何服务（ADR-0054）', () => {
    for (const name of ZERO_DEPENDENCY) {
      const decl = byName.get(name)
      expect(decl, `未找到服务声明: ${name}`).toBeDefined()
      expect(
        decl?.inject ?? [],
        `${name} 必须保持零业务依赖（ADR-0054「零业务依赖、最先可用」），当前 inject: ${(decl?.inject ?? []).join(', ')}`,
      ).toEqual([])
    }
  })

  it('核心八服务不反向依赖 devtools（诊断工具层不进运行时主路径）', () => {
    const offenders = CORE_SERVICES.filter((name) => (byName.get(name)?.inject ?? []).includes('devtools'))
    expect(
      offenders,
      `核心服务反向依赖 devtools（诊断耦合进运行时主路径）: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('核心八服务全部声明在案（ADR-0011 保护列完整）', () => {
    const missing = CORE_SERVICES.filter((name) => !byName.has(name))
    expect(missing, `核心服务缺失声明: ${missing.join(', ')}`).toEqual([])
  })
})
