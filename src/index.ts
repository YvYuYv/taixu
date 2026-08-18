import { Context } from 'cordis'
import './events'
import { MonitorService } from './services/monitor'
import { SecurityService, type PermissionRule } from './services/security'

export { MonitorService } from './services/monitor'
export { SecurityService } from './services/security'
export type { PermissionRule, PermissionVerdict } from './services/security'
export { createProbeApp } from './probe'
export type { ProbeReport, ProbeOptions } from './probe'
export * from './events'

/** createCordis 配置：阈值均经配置注入（测试注小值触发，生产默认按各 ADR） */
export interface CreateCordisOptions {
  /** 权限规则（本地可判定，deny-by-default，ADR-0051） */
  permissions?: PermissionRule[]
}

/**
 * 框架入口：一次调用拉起核心运行时。
 *
 * 01 号票范围：基础层 = monitor + security（零业务依赖、最先可用，ADR-0054）。
 * 其余六服务由后续票在此挂接；初始化顺序由 Cordis DI 解析，禁止手写顺序表。
 *
 * @returns 宿主 ctx（根上下文）
 */
export function createCordis(options: CreateCordisOptions = {}): Context {
  const ctx = new Context()
  ctx.plugin(MonitorService)
  ctx.plugin(SecurityService, { rules: options.permissions ?? [] })
  return ctx
}
