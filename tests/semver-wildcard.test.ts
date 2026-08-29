/**
 * SemVer 通配符（deps §七，F6 曝出）：`range: '*'` 此前落到精确比较恒 false——
 * 共享依赖声明"任意版本"时仲裁永远无匹配（strict 模式直接失败，宿主看到的是
 * "依赖缺失"而非真正的版本问题）。
 *
 * 语义源：heterogeneous-loading.md §七（共享依赖仲裁 + 版本分裂提示 ADR-0038）。
 */
import { describe, it, expect } from 'vitest'
import { satisfies } from '../src/services/deps/semver'

describe('satisfies 通配符（F6 曝出）', () => {
  it("'*' / 'x' 匹配任意版本（含预发布与 0.x）", () => {
    expect(satisfies('17.0.0', '*')).toBe(true)
    expect(satisfies('0.0.1', '*')).toBe(true)
    expect(satisfies('1.2.3-beta.1', '*')).toBe(true)
    expect(satisfies('17.0.0', 'x')).toBe(true)
    expect(satisfies('17.0.0', 'X')).toBe(true)
  })

  it('既有范围语义不变（回归保护）', () => {
    expect(satisfies('1.2.3', '^1.0.0')).toBe(true)
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false) // 主版本不同
    expect(satisfies('1.2.9', '~1.2.0')).toBe(true)
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false) // 次版本不同
    expect(satisfies('1.2.3', '>=1.0.0')).toBe(true)
    expect(satisfies('1.2.3', '1.2.3')).toBe(true) // 精确
    expect(satisfies('1.2.4', '1.2.3')).toBe(false)
  })
})

describe('satisfies 简写（F6 子项曝出）', () => {
  it("'^2' / '~2.1' 缺省次修版本的写法（npm 语义）", () => {
    expect(satisfies('2.7.16', '^2')).toBe(true) // >=2.0.0 <3.0.0
    expect(satisfies('3.0.0', '^2')).toBe(false)
    expect(satisfies('2.1.5', '~2.1')).toBe(true) // >=2.1.0 <2.2.0
    expect(satisfies('2.2.0', '~2.1')).toBe(false)
    expect(satisfies('2.7.16', '~2')).toBe(true) // ~M -> <(M+1).0.0
    expect(satisfies('3.0.0', '~2')).toBe(false)
  })
})
