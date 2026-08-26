/** 沙箱域错误（js-sandbox §3.2：dispose 后句柄不可用） */
export class SandboxDisposedError extends Error {
  constructor(appId: string) {
    super(`sandbox for ${appId} has been disposed`)
    this.name = 'SandboxDisposedError'
  }
}

/** KillSwitch 禁用应用错误（security §十：加载路径强制执行点；不进恢复重试） */
export class AppDisabledError extends Error {
  constructor(appId: string) {
    super(`app "${appId}" is disabled by killswitch`)
    this.name = 'AppDisabledError'
  }
}

/** 共享依赖仲裁冲突（heterogeneous §七：singleton/strict 无满足版本——加载期 fail-fast，
 * 进入 lifecycle 恢复策略，不"强制塞旧版本+console.warn"） */
export class DependencyConflictError extends Error {
  public readonly depName: string
  public readonly range: string
  public readonly available: string[]
  constructor(depName: string, range: string, available: string[]) {
    super(`dependency conflict: "${depName}@${range}" unsatisfied (available: ${available.join(', ') || 'none'})`)
    this.name = 'DependencyConflictError'
    this.depName = depName
    this.range = range
    this.available = available
  }
}
