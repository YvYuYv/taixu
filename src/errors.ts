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
