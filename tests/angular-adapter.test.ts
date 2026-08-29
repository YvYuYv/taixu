/**
 * Angular 适配器（heterogeneous-loading §4.2，P2 实验性路线，F6）。
 *
 * 主缝 = createCordis + deps.registerShared('@angular/core', 替身) + lifecycle.mount。
 * 断言：createApplication 独立 ApplicationRef / bootstrap 传容器 / 错误经 ErrorHandler
 * DI token 转发 monitor.capture / dispose 时 destroy + 容器清空校验 / 未注册共享依赖
 * 即失败（strict 仲裁，不静默降级）。
 *
 * 替身而非真 Angular：本适配器零硬依赖（框架不 import @angular/core），且 Angular
 * 路线属实验性——替身恰好验证"经共享依赖仲裁"这一契约本身。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp, defineCordisAngularApp, type AngularCoreModule } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

/** async effect（deps.negotiate + createApplication 都是异步）：轮询等待条件成立 */
async function waitFor(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('waitFor: 条件在超时前未成立')
}

beforeEach(() => {
  document.body.textContent = ''
})

/** Angular core 替身：记录调用序列，bootstrap 往容器塞一个节点模拟渲染 */
function fakeAngularCore(log: string[]) {
  const ErrorHandler = { __brand: 'ErrorHandler' }
  const core: AngularCoreModule & { captured: unknown[] } = {
    ErrorHandler,
    captured: [],
    async createApplication(config?: { providers?: unknown[] }) {
      log.push('createApplication')
      // 捕获 ErrorHandler provider（适配器注入的错误边界）
      const handler = (config?.providers ?? []).find(
        (p) => (p as { provide?: unknown }).provide === ErrorHandler,
      ) as { useValue?: { handleError: (e: unknown) => void } } | undefined
      if (handler?.useValue) core.captured.push(handler.useValue)
      return {
        bootstrap(component: unknown, rootSelectorOrNode?: string | Element) {
          log.push(`bootstrap:${String(component)}`)
          if (rootSelectorOrNode instanceof Element) {
            rootSelectorOrNode.appendChild(document.createElement('span')) // 模拟渲染产物
          }
          return { __brand: 'ComponentRef' }
        },
        destroy() {
          log.push('destroy')
        },
      }
    },
  }
  return core
}

describe('Angular 适配器（F6，heterogeneous-loading §4.2 实验性）', () => {
  it('createApplication 独立 ApplicationRef + bootstrap 到容器；dispose 时 destroy', async () => {
    const log: string[] = []
    const core = fakeAngularCore(log)
    const host = createCordis({
      apps: [
        // 与 Vue/React 适配器测试同构：entry 同步返回 plugin（本适配器零硬依赖）
        defineApp('ng-app', () =>
          defineCordisAngularApp({ appId: 'ng-app', rootComponent: 'NgRootCmp' }),
        ),
      ],
    })
    await settle()
    host.deps.registerShared('@angular/core', { version: '17.0.0', module: core })
    const inst = await host.lifecycle.mount('ng-app', 'main')
    await waitFor(() => log.includes('bootstrap:NgRootCmp')) // async effect 收敛

    expect(log).toContain('createApplication') // 每应用独立 ApplicationRef（非共享 platform）
    expect(log).toContain('bootstrap:NgRootCmp')
    expect((inst.container as HTMLElement).childElementCount).toBeGreaterThan(0) // 已渲染

    await host.lifecycle.destroy(inst.instanceId, 'test')
    expect(log).toContain('destroy') // effect 回收
    expect((inst.container as HTMLElement).childElementCount).toBe(0) // 容器已清空
  })

  it('渲染错误经 ErrorHandler DI token 转发 monitor.capture（唯一错误入口）', async () => {
    const log: string[] = []
    const core = fakeAngularCore(log)
    const errors: Array<{ message: string; appId?: string }> = []
    const host = createCordis({
      apps: [
        defineApp('ng-app', () =>
          defineCordisAngularApp({ appId: 'ng-app', rootComponent: 'NgRootCmp' }),
        ),
      ],
    })
    await settle()
    host.on('monitor/report', (e) => errors.push(e.metric as { message: string; appId?: string }), {
      global: true,
    })
    host.deps.registerShared('@angular/core', { version: '17.0.0', module: core })
    await host.lifecycle.mount('ng-app', 'main')
    await waitFor(() => core.captured.length > 0) // 等 ErrorHandler provider 注入

    // 适配器把 ErrorHandler provider 注入了；触发它 -> 应进 monitor.capture
    const handler = core.captured[0] as { handleError: (e: unknown) => void }
    expect(handler).toBeTruthy() // 错误边界已注入（否则 Angular 错误会脱离监控）
    handler.handleError(new Error('ng render boom'))
    expect(errors.some((e) => e.message === 'ng render boom' && e.appId === 'ng-app')).toBe(true)
  })

  it('未注册 @angular/core 共享依赖：Angular 不启动 + 错误显式上报（不静默降级）', async () => {
    const errors: Array<{ message: string; appId?: string }> = []
    const host = createCordis({
      recovery: { maxRetries: 0, backoffMs: 0 },
      apps: [
        defineApp('ng-app', () =>
          defineCordisAngularApp({ appId: 'ng-app', rootComponent: 'NgRootCmp' }),
        ),
      ],
    })
    await settle()
    host.on('monitor/report', (e) => errors.push(e.metric as { message: string; appId?: string }), {
      global: true,
    })
    const inst = await host.lifecycle.mount('ng-app', 'main')
    await waitFor(() => errors.length > 0) // 等 async effect 的错误上报

    // 实验性路线不给"半可用"：缺共享依赖即失败（strict 仲裁），而不是静默不渲染
    expect((inst.container as HTMLElement).childElementCount).toBe(0) // 未渲染出任何内容
    // async effect 的错误否则被 cordis 静默吞（task.catch(logger.error)）——
    // 适配器显式上报，宿主与监控可见
    expect(errors[0]?.appId).toBe('ng-app')
  })
})
