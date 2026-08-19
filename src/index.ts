import { Context } from 'cordis'
import './events'
import { MonitorService } from './services/monitor'
import { SecurityService, type PermissionRule } from './services/security'
import { SandboxService } from './services/sandbox'
import { DepsService, type AppManifestEntry } from './services/deps'
import { LifecycleService, type RecoveryConfig } from './services/lifecycle'
import { StyleService } from './services/style'
import { defineCordisApp } from './vue3-adapter'

export { MonitorService } from './services/monitor'
export { SecurityService } from './services/security'
export type { PermissionRule, PermissionVerdict } from './services/security'
export { SandboxService } from './services/sandbox'
export { createSandbox, storagePrefix } from './sandbox'
export { SandboxDisposedError } from './errors'
export type { Sandbox, SandboxOptions } from './sandbox'
export { createProbeApp } from './probe'
export type { ProbeReport, ProbeOptions } from './probe'
export { DepsService } from './services/deps'
export type { AppManifestEntry } from './services/deps'
export { LifecycleService } from './services/lifecycle'
export type { AppInstance, MountOptions, RecoveryConfig, LifecycleConfig, AppExternalState } from './services/lifecycle'
export { StyleService } from './services/style'
export type { StyleAsset } from './services/style'
export { defineCordisApp } from './vue3-adapter'
export type { CordisAppOptions } from './vue3-adapter'
export * from './events'

/** createCordis 配置：阈值均经配置注入（测试注小值触发，生产默认按各 ADR） */
export interface CreateCordisOptions {
  /** 权限规则（本地可判定，deny-by-default，ADR-0051） */
  permissions?: PermissionRule[]
  /** 应用清单（appId + 入口工厂） */
  apps?: AppManifestEntry[]
  /** 错误恢复策略（lifecycle §六） */
  recovery?: RecoveryConfig
  /** 槽位选择器映射 */
  outlets?: Record<string, string>
}

/**
 * 声明应用清单条目：defineApp(appId, entryFactory)。
 * 入口工厂在每次挂载事务中调用（重试 = 新事务 = 新插件实例）。
 */
export function defineApp(appId: string, entry: () => unknown): AppManifestEntry {
  return { appId, entry }
}

/**
 * 框架入口：一次调用拉起核心运行时。
 *
 * 01 号票：基础层 = monitor + security（零业务依赖、最先可用，ADR-0054）。
 * 02 号票：+ sandbox（双窗口 Proxy 沙箱工厂，first-party）。
 * 03 号票：+ deps（最小加载）+ lifecycle（挂载事务）。
 * 04 号票：+ style（样式登记辅助服务）+ Vue 3 参考适配器（defineCordisApp）。
 * 其余三服务（bus/state/router）由后续票挂接；初始化顺序由 Cordis DI 解析，禁止手写顺序表。
 *
 * @returns 宿主 ctx（根上下文）
 */
export function createCordis(options: CreateCordisOptions = {}): Context {
  const ctx = new Context()
  ctx.plugin(MonitorService)
  ctx.plugin(SecurityService, { rules: options.permissions ?? [] })
  ctx.plugin(SandboxService)
  ctx.plugin(DepsService, { apps: options.apps })
  ctx.plugin(StyleService)
  ctx.plugin(LifecycleService, {
    recovery: options.recovery,
    outlets: options.outlets,
  })
  return ctx
}
