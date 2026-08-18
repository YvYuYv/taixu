import { Service, type Context } from 'cordis'
import '../events'

/** 权限规则：本地可判定（ADR-0051），deny-by-default */
export interface PermissionRule {
  appId: string
  /** 允许的能力，支持 `net:fetch` 精确项与 `net:*`/`*` 通配（基线 §四.6） */
  allow: string[]
}

/** 权限裁决结果：单点查询族，不经事件调度，直接服务方法返回（ADR-0028） */
export interface PermissionVerdict {
  allowed: boolean
  rule?: string
}

/**
 * 安全服务：权限唯一实现（基线 §四.6）。
 *
 * - security 零业务依赖、最先可用（ADR-0054）
 * - 裁决规则只本地可判定、不做跨调用缓存（ADR-0039/0051）
 * - deny-by-default：无规则命中即拒绝
 * - 违规上报经 security/violation 事件（由 monitor 旁听，不 inject monitor，ADR-0054）
 *
 * 注：消费点（bus/state/router/deps/scopedFetch 拒绝时调 reportViolation）
 * 由 11 号票接线；本票只提供裁决与上报原语。
 */
export class SecurityService extends Service {
  static provide = 'security'

  private rules: PermissionRule[]

  constructor(ctx: Context, config: { rules?: PermissionRule[] } = {}) {
    super(ctx, 'security')
    this.rules = config.rules ?? []
  }

  /** 权限裁决：单点查询（基线 §2.4.1），本地可判定、不缓存（ADR-0039/0051） */
  check(appId: string, action: string): PermissionVerdict {
    for (const rule of this.rules) {
      if (rule.appId !== appId && rule.appId !== '*') continue
      for (const pattern of rule.allow) {
        if (matchAction(pattern, action)) return { allowed: true, rule: pattern }
      }
    }
    return { allowed: false }
  }

  /** 违规上报：通知族事件，宿主/monitor 旁听（fire-and-forget） */
  reportViolation(appId: string, rule: string, detail: unknown): void {
    this.ctx.emit('security/violation', { appId, rule, detail })
  }
}

/** 通配匹配：`*` 全量、`net:*` 前缀族、`net:fetch` 精确 */
function matchAction(pattern: string, action: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith(':*')) return action.startsWith(pattern.slice(0, -1))
  return pattern === action
}

declare module 'cordis' {
  interface Context {
    security: SecurityService
  }
}
