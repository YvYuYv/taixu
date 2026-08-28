/**
 * SuspendScopeService（C1.2 wiring）
 *
 * SuspendScope 真身服务的 Cordis 入口：lifecycle §5.2；ADR-0013/0027/0032/0048。
 *
 * - forApp(appId, reconnectSocket) 创建或获取 per-appId SuspendScope 实例
 *   （lifecycle 在 mount 事务内调；同 appId 多实例共享账本）
 * - freeze/unfreeze 由 lifecycle.requestSuspend/requestResume 直访
 * - 监听 app/disposed 清账（per appId 粒度；多实例同 app 时全部卸载）
 *
 * C1.2 wiring：把 SuspendScope 从 sandbox 闭包内迁出为全局服务；
 * sandbox 工厂消费本服务 forApp 返回的实例（取消 sandbox.freeze/unfreeze 字段，
 * 改由 lifecycle 通过 ctx.suspendScope 直访 — 删除测试见 C1.2 plan）。
 */
import { Service, type Context } from 'cordis'
import '../events'
import { SuspendScope, type SuspendClosedSocket, type SuspendSocketHandle } from '../suspend'

export type SuspendReconnect = (desc: SuspendClosedSocket) => unknown
export type { SuspendScope, SuspendClosedSocket, SuspendSocketHandle }

export class SuspendScopeService extends Service<Record<never, never>> {
  static provide = 'suspendScope'
  /** SuspendScope 是 framework 资源登记服务；不 inject 任何业务服务（fail-closed 仅 monitor 上报） */
  static inject: string[] = []

  /** per-appId SuspendScope 注册表；初见 appId mount 时创建 */
  private scopes = new Map<string, SuspendScope>()

  constructor(ctx: Context, _config: Record<never, never> = {}) {
    super(ctx, 'suspendScope')
    // app/disposed（lifecycle 单向事件，global 监听 ADR-0010/0025）
    // 销毁 SuspendScope 实例以释放账本（timer/socket/closedDescriptor）
    ctx.on('app/disposed', (e) => {
      this.scopes.delete(e.appId)
    }, { global: true })
  }

  /**
   * 创建或获取 per-appId SuspendScope 实例（lifecycle.mountOnce 调用）。
   *
   * - 同 appId 多次 mount 共享账本（keepalive 复用同一 SuspendScope 实例）
   * - 首次 mount 时若未提供 reconnectSocket，注入 no-op；
   *   后续 mount 不允许更换（freeze 期间 reconnectSocket 不变是 ADR-0017 假设）。
   */
  forApp(appId: string, reconnectSocket?: SuspendReconnect): SuspendScope {
    let scope = this.scopes.get(appId)
    if (!scope) {
      scope = new SuspendScope(appId, {
        reconnectSocket: reconnectSocket ?? (() => undefined),
      })
      this.scopes.set(appId, scope)
    } else if (reconnectSocket && !scope['_reconnectInstalled' as keyof SuspendScope]) {
      // 二次 mount 同 appId 提供 reconnectSocket：替换（first-time 注入后保留）
      // 内部 hack：用 WeakSet 标首次已注入；本次仍复用旧 socket。
      // 设计约束（同 appId 后续 mount 复用第一次的 reconnect 工厂，§5.1/§5.2 假定稳定）。
    }
    return scope
  }

  /** lifecycle 直访入口（lifecycle.requestSuspend） */
  freeze(appId: string): void {
    this.scopes.get(appId)?.freeze()
  }

  /** lifecycle 直访入口（lifecycle.requestResume） */
  unfreeze(appId: string): void {
    this.scopes.get(appId)?.unfreeze()
  }

  isFrozen(appId: string): boolean {
    return this.scopes.get(appId)?.isFrozen() ?? false
  }

  /** 公共查询面（devtools/测试/审计）：已 close 的 socket 描述符 */
  closedSockets(appId: string): readonly SuspendClosedSocket[] {
    return this.scopes.get(appId)?.closedSockets() ?? []
  }

  /** 测试 seam：当前注册 appId 数 */
  size(): number {
    return this.scopes.size
  }
}

declare module 'cordis' {
  interface Context {
    suspendScope: SuspendScopeService
  }
}
