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
 * - 支持 `*`/`x` 通配符（任意版本；F6 曝出：此前 range:'*' 恒不匹配）
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
    // 通配符（任意版本）：deps §七 未列出，但 `*` 是共享依赖 range 的最常见写法——
    // 此前落到精确比较恒 false，导致 `range: '*'` 的仲裁永远无匹配（F6 曝出）
    if (part === '*' || part === 'x' || part === 'X') return true
    // 简写支持（F6 子项曝出）：`^2` / `~2.1` 等缺省次修版本的写法——此前正则要求
    // 完整三段，缺省即不匹配、落到精确比较恒 false
    const caret = part.match(/^\^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/)
    if (caret) {
      const major = Number(caret[1])
      return pv[0] === major && compareVersions(version, `${major}.${Number(caret[2] ?? 0)}.0`) >= 0
    }
    const tilde = part.match(/^~(\d+)(?:\.(\d+))?(?:\.(\d+))?$/)
    if (tilde) {
      const major = Number(tilde[1])
      const minor = Number(tilde[2] ?? 0)
      // ~M.m -> <M.(m+1).0；~M（无次版本）-> <(M+1).0.0（npm 语义）
      const upper = tilde[2] !== undefined ? `${major}.${minor + 1}.0` : `${major + 1}.0.0`
      return compareVersions(version, `${major}.${minor}.0`) >= 0 && compareVersions(upper, version) > 0
    }
    const gte = part.match(/^>=(\d+\.\d+\.\d+)$/)
    if (gte) return compareVersions(version, gte[1]!) >= 0
    return compareVersions(version, part) === 0
  })
}

/** 比较函数导出版（C9-A 测试需要）—— 仅最高满足版本排序使用，不暴露给业务层 */
export const compareVersionsInternal = compareVersions
export const parseVersionInternal = parseVersion
