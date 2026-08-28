/**
 * 事件契约机器校验（C16-A，基线 §2.4 / ADR-0047 / ADR-0050）：
 *
 * `src/events.ts` 是事件族契约的唯一权威源（事件名 + 载荷形状 + 调度语义）。
 * 本测试把契约一致性固化为机器校验，防止未来 drift：
 *
 * 1. **无孤儿定义**：events.ts 声明的每个事件名都有实际派发/监听点（不声明不用的死契约）
 * 2. **无野生事件**：代码里派发/监听的每个事件名都在 events.ts 有声明（不绕过契约私自造事件）
 * 3. **serial 族调度语义**：serial 调度族（router/navigate）必须声明可裁决返回类型
 *    （GuardResult | Promise<GuardResult>）——禁止退回"真值判断"（ADR-0002）
 *
 * 为什么是测试而不是文档：契约会 drift，文档不会自动失败。本测试与
 * `npm run verify` 同跑——契约漂移即红灯。
 *
 * 已知例外（显式白名单，见 EXPECTED_EXCEPTIONS）：
 * - `outlet/changed:{outlet}` 是模板字面量族（ADR-0047/0050）——
 *   interface 只声明代表性键 `outlet/changed:main`，实现侧按槽位动态落键
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'

const SRC = join(process.cwd(), 'src')
const EVENTS_FILE = join(SRC, 'events.ts')

/** 递归收集 src/ 下所有 .ts 文件 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
  })
}

/** 事件名形状：`namespace/name` 或 `namespace/name:suffix` */
const EVENT_NAME = /([a-z]+\/[a-z]+(?::[a-z]+)?)/

/**
 * events.ts 中**声明**的事件名：`'app/loading'(payload: ...)` 形式
 * （事件名后紧跟 `(` = 声明行；排除注释中的说明性引用）
 */
function declaredEvents(src: string): Set<string> {
  const out = new Set<string>()
  const re = /'([a-z]+\/[a-z]+(?::[a-z]+)?)'\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) out.add(m[1] as string)
  return out
}

/**
 * 源码中**派发/监听**的事件名：`.emit(` / `.on(` / `.serial(` 调用参数内的
 * 字符串字面量或模板字面量前缀；模板字面量族另经落键 helper 调用登记。
 */
function usedEvents(files: string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const rel = relative(process.cwd(), file)
    // 调度调用后 200 字符内找事件名（覆盖 events.emit(ctx, 'x/y', payload) 形态）
    const callRe = /\.(?:emit|on|serial)\(([\s\S]{0,200}?)\)/g
    let m: RegExpExecArray | null
    while ((m = callRe.exec(src)) !== null) {
      const args = m[1] ?? ''
      // 字符串字面量 'x/y' 或模板字面量 `x/y:${...}`（取冒号前的前缀）
      const ev = args.match(EVENT_NAME)
      if (ev?.[1] && !out.has(ev[1])) out.set(ev[1], rel)
    }
    // 模板字面量族：落键 helper 调用即登记族前缀（键本身由 helper 动态生成）
    for (const [family, helper] of Object.entries(TEMPLATE_FAMILIES)) {
      if (new RegExp(`\\b${helper}\\s*\\(`).test(src) && !out.has(family)) {
        out.set(family, rel)
      }
    }
  }
  return out
}

/**
 * 模板字面量事件族白名单：定义名带 `:suffix`（interface 只声明代表性键），
 * 实现侧经**落键 helper** 动态生成（ADR-0047/0050：interface 不支持计算模板键）。
 * 族前缀 -> 落键 helper 名；helper 调用出现即视为该族的使用点。
 */
const TEMPLATE_FAMILIES: Record<string, string> = {
  'outlet/changed': 'outletEventKey',
}

describe('事件契约机器校验（events.ts 唯一权威源）', () => {
  const eventsSrc = readFileSync(EVENTS_FILE, 'utf8')
  const declared = declaredEvents(eventsSrc)
  const used = usedEvents(walk(SRC).filter((f) => f !== EVENTS_FILE))

  it('events.ts 声明了事件族（非空契约）', () => {
    expect(declared.size).toBeGreaterThan(0)
  })

  it('无孤儿定义：events.ts 每个声明事件都有派发/监听点', () => {
    const orphans = [...declared].filter((name) => {
      // 模板字面量族：按 ":" 前前缀匹配（outlet/changed:main -> outlet/changed 落键 helper）
      const base = name.split(':')[0] as string
      if (base in TEMPLATE_FAMILIES) {
        return !used.has(base) && !used.has(name)
      }
      return !used.has(name)
    })
    expect(
      orphans,
      `以下事件在 events.ts 声明但代码中无派发/监听点（死契约）: ${orphans.join(', ')}`,
    ).toEqual([])
  })

  it('无野生事件：代码派发/监听的每个事件名都在 events.ts 声明', () => {
    const wild = [...used.keys()].filter((name) => {
      if (declared.has(name)) return false
      // 模板字面量族前缀（outlet/changed）视为合法——对应声明 'outlet/changed:main'
      const base = name.split(':')[0] as string
      if (base in TEMPLATE_FAMILIES) return false
      return true
    })
    expect(
      wild,
      `以下事件在代码中派发/监听但 events.ts 未声明（绕过契约）: ${wild.join(', ')}`,
    ).toEqual([])
  })

  it('serial 族调度语义：router/navigate 声明可裁决返回类型（ADR-0002 禁用真值判断）', () => {
    const line = eventsSrc.match(/'router\/navigate'\(payload:[^)]*\)\s*:\s*([^;\n]+)/)
    expect(line, 'events.ts 未声明 router/navigate 调度语义').not.toBeNull()
    const retType = (line?.[1] ?? '').trim()
    // 守卫返回显式枚举包络：GuardResult 或 Promise<GuardResult>（serial 异步裁决）
    expect(retType).toMatch(/GuardResult\s*\|\s*Promise<GuardResult>/)
  })
})
