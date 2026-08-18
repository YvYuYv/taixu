import { Service, type Context } from 'cordis'
import '../events'
import { createSandbox, type Sandbox, type SandboxOptions } from '../sandbox'

/**
 * 沙箱服务（js-sandbox §二）：
 * - 每应用实例化、不池化（§4.4）
 * - 创建动作挂 fiber effect 由 lifecycle 在挂载事务内接线（§4.1，03 号票）；
 *   本票提供 create 工厂与 destroy 幂等原语
 * - iframe 沙箱（third-party 安全边界）为 P1 范围（ADR-0049），本票不含
 */
export class SandboxService extends Service<Record<never, never>> {
  static provide = 'sandbox'
  static inject = ['security', 'monitor']

  constructor(ctx: Context, _config: Record<never, never> = {}) {
    super(ctx, 'sandbox')
  }

  /** 每应用创建独立沙箱（不池化：池化会把上一应用的闭包/前缀残留带进下一应用，§4.4） */
  create(appId: string, options: SandboxOptions = {}): Promise<Sandbox> {
    return createSandbox(this.ctx, appId, options)
  }
}

declare module 'cordis' {
  interface Context {
    sandbox: SandboxService
  }
}
