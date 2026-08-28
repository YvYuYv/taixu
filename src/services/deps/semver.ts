/**
 * SemVer helpers（deps §七：satisfies 含 ^/~/>=/精确与预发布后缀；不引 node-semver 全量包）。
 *
 * 5 个顶层 helpers 从 deps.ts 顶部抽离——零依赖（不接触 ctx/security/monitor/shared Map），
 * 是 deps.ts 内最纯粹的子系统。
 *
 * **C9-A 抽离动机**：原 deps.ts 顶部 50 行 SemVer 工具与 deps 服务类混在一起，
 * 单测 SemVer 不必启 Cordis/创建 host；抽离后保持"薄顶层 + 厚逻辑"形态
 * （C5-A keepAlive / C6-A tracing helpers / C7-A leakDetector / C8-A router parsers 同节奏）。
 *
 * **已知盲区**（§七允许不引 node-semver）：
 * - 预发布之间不逐标识符比较（alpha/beta 判等）
 * - OR（`||`）组合不支持
 */

/** 版本解析：主.次.修[-预发布] -> 可比较数组（预发布 < 正式版） */
function parseVersion(v: string): number[] {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!m) return [-1, -1, -1]
  const core = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (m[4] === undefined) return [...core, 1] // 正式版 > 预发布
  return [...core, 0]
}

/** 版本比较（与 parseVersion 一同迁移） */
function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 4; i++) {
    if (pa[i]! < pb[i]!) return -1
    if (pa[i]! > pb[i]!) return 1
  }
  return 0
}

/**
 * range 满足判定（AND 组合）：`^x.y.z`（同主版本且 >=）`~x.y.z`（同主.次且 >=）
 * `>=x.y.z` 与精确。已知盲区（轻量裁剪，§七 允许不引 node-semver）：预发布之间
 * 不逐标识符比较（alpha/beta 判等）；OR（`||`）组合不支持。
 */
export function satisfies(version: string, range: string): boolean {
  return range.split(/\s+/).filter(Boolean).every((part) => {
    const pv = parseVersion(version)
    const caret = part.match(/^\^(\d+)\.(\d+)\.(\d+)$/)
    if (caret) {
      return pv[0] === Number(caret[1]) && compareVersions(version, part.slice(1)) >= 0
    }
    const tilde = part.match(/^~(\d+)\.(\d+)\.(\d+)$/)
    if (tilde) {
      return (
        pv[0] === Number(tilde[1]) &&
        pv[1] === Number(tilde[2]) &&
        compareVersions(version, part.slice(1)) >= 0
      )
    }
    const gte = part.match(/^>=(\d+\.\d+\.\d+)$/)
    if (gte) return compareVersions(version, gte[1]!) >= 0
    return compareVersions(version, part) === 0
  })
}

/** 比较函数导出版（C9-A 测试需要）—— 仅最高满足版本排序使用，不暴露给业务层 */
export const compareVersionsInternal = compareVersions
export const parseVersionInternal = parseVersion
