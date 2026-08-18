/** 沙箱域错误（js-sandbox §3.2：dispose 后句柄不可用） */
export class SandboxDisposedError extends Error {
  constructor(appId: string) {
    super(`sandbox for ${appId} has been disposed`)
    this.name = 'SandboxDisposedError'
  }
}
