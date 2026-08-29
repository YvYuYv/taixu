/**
 * 原型守护（js-sandbox §3.3，F12）：createCordis 启动期冻结内建原型（**opt-in**，
 * 默认关闭），阻断「应用侧 monkey-patch 原型影响所有应用」的污染向量（逃逸向量表
 * #14：`Array.prototype.xxx` 被修改 = 高风险）。
 *
 * 语义源：js-sandbox.md §3.3（可用性优先的正确实现——不复制 Object，直接冻结原型）。
 *
 * **与规范"默认冻结"的偏差（落地时实测发现）**：全量冻结与 cordis 运行时自身不兼容
 * ——cordis 内部存在对对象 constructor 的写点（外部依赖不可修），默认开启实测
 * 81/343 用例失败。按 §3.3 标题"可用性优先"改为 opt-in，宿主开启前须完成自有
 * 兼容性验证。
 *
 * freeze 是**进程级不可逆**策略（规范明示页面即卸载无需恢复）；vitest 按文件隔离
 * worker，本文件的冻结不泄漏到其他测试文件——用例顺序：先验证默认不冻结，再 opt-in。
 */
import { describe, it, expect } from 'vitest'
import { createCordis, defineApp, freezePrototypes, DEFAULT_FREEZE_TARGETS } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

describe('原型守护（F12，js-sandbox §3.3）', () => {
  it('默认关闭：不冻结（既有宿主零感知，兼容性由 opt-in 保障）', async () => {
    createCordis({ apps: [defineApp('n-app', () => ({ name: 'n-app', apply() {} }))] })
    await settle()
    expect(Object.isFrozen(Array.prototype)).toBe(false) // 未 opt-in 不冻结
  })

  it('opt-in（enabled: true）：默认集冻结生效；应用行为不受影响（freeze 只挡修改不挡调用）', async () => {
    const host = createCordis({
      prototypeGuard: { enabled: true },
      apps: [defineApp('f-app', () => ({ name: 'f-app', apply() {} }))],
    })
    await settle()
    for (const proto of DEFAULT_FREEZE_TARGETS) {
      expect(Object.isFrozen(proto)).toBe(true) // 默认集全部冻结
    }
    // 冻结不破坏正常使用
    const inst = await host.lifecycle.mount('f-app', 'main')
    expect(inst.appId).toBe('f-app')
    expect([1, 2, 3].map((n) => n * 2)).toEqual([2, 4, 6])
    expect('abc'.toUpperCase()).toBe('ABC')
    expect(Object.keys({ a: 1 })).toEqual(['a']) // 旧版复制方案的 Object.keys 崩溃不复现
  })

  it('冻结后修改原型即抛错（污染向量被阻断；模块代码默认 strict）', () => {
    expect(() => {
      ;(Array.prototype as unknown as Record<string, unknown>).__evil = true
    }).toThrow()
    expect((Array.prototype as unknown as Record<string, unknown>).__evil).toBeUndefined()
  })

  it('自定义 targets + freezePrototypes 幂等（多 host / fiber 重跑安全）', () => {
    const custom = { nested: 1 }
    freezePrototypes([custom])
    expect(Object.isFrozen(custom)).toBe(true)
    freezePrototypes([custom]) // 重复冻结幂等
    expect(Object.isFrozen(custom)).toBe(true)
    expect(DEFAULT_FREEZE_TARGETS.length).toBeGreaterThanOrEqual(10) // 默认集在案
  })
})
