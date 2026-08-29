/**
 * PII 脱敏管道（monitoring.md §六，F9）。
 *
 * 规范四条纪律：
 * 1. **不采集 textContent**（点击目标只采 role/tagName/`data-track`）
 * 2. URL query 脱敏（与 `security.sanitizeQuery` 同规则：token 类剥离）
 * 3. 用户标识 = **会话随机 ID**（不指纹）；合规：采集清单 + 关闭开关（DNT 尊重）
 * 4. 敏感键（state `sensitiveKeys`）联动掩码
 *
 * 形态：**零状态纯模块**（无 ctx、无服务依赖，与 monitor 同层 L0）——
 * 脱敏是纯文本变换，不需要服务生命周期。配置由调用方（monitor）持有。
 */
export interface PrivacyConfig {
  /** 敏感键模式（默认与 state sensitiveKeys 同族；命中即掩码其后的值） */
  sensitiveKeys?: string[]
  /** 掩码替换文本（默认 `[REDACTED]`） */
  mask?: string
  /** 尊重 DNT（`navigator.doNotTrack`；默认 true） */
  respectDnt?: boolean
  /** 关闭开关（默认 true；宿主可整体关闭——但采集清单随之失效，风险自负） */
  enabled?: boolean
}

/** 与 state sensitiveKeys 同族的默认敏感键（§六 敏感键联动） */
export const DEFAULT_SENSITIVE_KEYS = [
  'token',
  'password',
  'passwd',
  'secret',
  'credential',
  'pii',
  'authorization',
  'cookie',
]

/**
 * 默认掩码：**不含 URL 需编码的字符**（`[`/`]` 会被 URLSearchParams 编码成
 * `%5B/%5D`，污染 query 形态）——文本与 URL 两种形态共用同一掩码，排障时可读且一致。
 */
const DEFAULT_MASK = 'REDACTED'

/**
 * URL 脱敏：剥离敏感 query 参数（§六：与 security.sanitizeQuery 同规则）。
 * 解析失败（非法 URL）时返回原串——脱敏失败不伪造产物。
 */
export function redactUrl(url: string, config: PrivacyConfig = {}): string {
  if (config.enabled === false) return url
  const qIndex = url.indexOf('?')
  if (qIndex === -1) return url
  let parsed: URL
  try {
    parsed = new URL(url, 'https://redact.invalid')
  } catch {
    return url
  }
  const keys = [...(config.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS)].map((k) => k.toLowerCase())
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (keys.some((k) => key.toLowerCase().includes(k))) {
      parsed.searchParams.set(key, config.mask ?? DEFAULT_MASK)
    }
  }
  const query = parsed.searchParams.toString()
  return query ? `${url.slice(0, qIndex)}?${query}` : url.slice(0, qIndex)
}

/**
 * 文本脱敏：对 `key=value` / `key: value` / `"key":"value"` 形态中的敏感键值做掩码
 * （错误 message 与 stack 里最常见的敏感数据形态——token/secret 被打进日志）。
 *
 * 只处理"键名命中 + 紧跟值"的结构化片段，不做整段猜测性替换——
 * 过度脱敏会让排障日志失去价值（§六 的边界：脱敏 ≠ 抹掉一切）。
 */
export function redactText(text: string, config: PrivacyConfig = {}): string {
  if (config.enabled === false || text === '') return text
  const keys = [...(config.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS)]
  const mask = config.mask ?? DEFAULT_MASK
  let out = text
  for (const key of keys) {
    // key=value（& 或空白或串尾结束）；key: value（JSON/日志两种常见形态）
    const patterns = [
      new RegExp(`(${escapeRegExp(key)}=)([^&\\s"']+)`, 'gi'),
      new RegExp(`("${escapeRegExp(key)}"\\s*:\\s*")([^"]*)(")`, 'gi'),
      new RegExp(`(${escapeRegExp(key)}:\\s*)([^\\s,;}]+)`, 'gi'),
    ]
    for (const re of patterns) {
      // 注意：`replace` 回调的**末两位参数是 offset 与完整字符串**，不是捕获组——
      // 用 groupCount 判组数（2 组 = 无闭合后缀；3 组 = 带后缀，如 JSON 的右引号）
      out = out.replace(re, (...args: unknown[]) => {
        const groupCount = args.length - 3
        const prefix = String(args[1])
        const suffix = groupCount >= 3 ? String(args[3]) : ''
        return `${prefix}${mask}${suffix}`
      })
    }
  }
  return out
}

/** 会话随机 ID（§六：会话随机，不指纹——每次调用生成新值，宿主负责持有） */
export function newSessionId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } }
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID()
  // 能力缺失兜底：仍走 CSPRNG（不退化成时间戳——那近乎可枚举）
  const bytes = new Uint8Array(16)
  ;(g.crypto as unknown as { getRandomValues?: (a: Uint8Array) => Uint8Array })?.getRandomValues?.(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** DNT 尊重（§六：合规关闭开关）——无法读取时按"未开启 DNT"处理（不因探测失败而停采集） */
export function dntEnabled(): boolean {
  const nav = (globalThis as unknown as { navigator?: { doNotTrack?: string | null } }).navigator
  return nav?.doNotTrack === '1'
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
