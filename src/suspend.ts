/**
 * 挂起注册表（lifecycle §5.2-2，ADR-0032/0048）：
 * 沙箱包装函数与 bus 投递路径的共享查询点——挂起则丢弃/延后/入队。
 * appId 键由沙箱实例创建期闭包捕获（ADR-0048，不做 zone.js 式运行时推断）；
 * 写入方唯一：lifecycle 服务（仲裁单点，§5.1.1）。
 */
const suspended = new Set<string>()

export const suspendRegistry = {
  suspend(appId: string): void {
    suspended.add(appId)
  },
  resume(appId: string): void {
    suspended.delete(appId)
  },
  isSuspended(appId: string): boolean {
    return suspended.has(appId)
  },
}
