/**
 * Angular 参考适配器（heterogeneous-loading.md §4.2，P2 **实验性**路线，F6）。
 *
 * 路线前提（规范"可行性诚实化"）：
 * - 子应用必须 **standalone components + AOT** 产出；运行时 `@NgModule` + JIT 方案
 *   已废除（依赖 JIT 装饰器 + reflect-metadata + 单 platform，实际不可行）
 * - 经 `createApplication()` 建**每应用独立 ApplicationRef**——规避 Angular
 *   "每页面仅一个 platform" 的限制（多应用并存的前提）
 *
 * 与 Vue/React 适配器同构：
 * - mount/unmount 包成**一次** effect（无第二套生命周期；dispose 自动回收）
 * - 渲染错误经 Angular `ErrorHandler` DI token 转发 `monitor.capture`（基线 §三 唯一错误入口）
 * - 重跑（服务替换/HMR 语义）时 destroy 后校验容器已清空，防双挂载
 * - styles 经 ctx.style.inject 显式登记（ADR-0033）
 *
 * **零硬依赖**：`@angular/core` 经 deps 共享依赖仲裁获取（框架不 import Angular——
 * Angular 是实验性路线，不应让所有宿主承担其体积与版本约束）。未注册即失败
 * （strict 仲裁），不做静默降级——降级只会让"实验性"变成"运行时随机崩"。
 */
import type { Context, Plugin } from 'cordis'
import type { StyleAsset } from './services/style'

/** Angular 核心模块最小面（经 deps 共享依赖取用；框架不 import @angular/core） */
export interface AngularCoreModule {
  createApplication: (config?: { providers?: unknown[] }) => Promise<AngularApplicationRef>
  /** `ErrorHandler` DI token（Angular 的错误边界注入点） */
  ErrorHandler?: unknown
}

/** `ApplicationRef` 最小面（每应用独立实例） */
export interface AngularApplicationRef {
  bootstrap: (component: unknown, rootSelectorOrNode?: string | Element) => unknown
  destroy: () => void
}

export interface CordisAngularAppOptions {
  appId: string
  /** standalone root component（AOT 产出） */
  rootComponent: unknown
  /** `@angular/core` 共享依赖版本范围（默认 `*`；应用侧须已 registerShared） */
  angularRange?: string
  /** 显式样式声明（经 ctx.style.inject 登记；第三方库的 head 注入走沙箱自动兜底） */
  styles?: StyleAsset[]
}

/**
 * 一行声明接入：返回 Cordis 插件，经 `defineApp(appId, () => plugin)` 进宿主清单。
 * 适配器职责只有"把 Angular 的 bootstrap/destroy 包成一次 effect"+ 错误转发。
 */
export function defineCordisAngularApp(options: CordisAngularAppOptions): Plugin.Object {
  const { appId, rootComponent, angularRange = '*', styles } = options
  return {
    name: appId,
    inject: ['lifecycle', 'monitor', 'style', 'deps'],
    apply(ctx: Context) {
      // 显式样式登记（ADR-0033；effect 随 dispose 逆序移除）
      for (const asset of styles ?? []) {
        ctx.style.inject(ctx, asset)
      }

      ctx.effect(async () => {
        const container = ctx.lifecycle.containerOf(ctx)
        if (!container) {
          throw new Error(`adapter: no container for app "${appId}" (mount outside lifecycle transaction?)`)
        }

        // 共享依赖仲裁（§七）：strict + singleton——Angular 框架类禁止双实例
        //（两份 Angular 的 DI 树 / zone 假设会 split-brain）
        let app: AngularApplicationRef
        try {
          const shared = await ctx.deps.negotiate('@angular/core', angularRange, {
            appId,
            singleton: true,
            strict: true,
          })
          const core = shared.module as AngularCoreModule

          // 错误边界：Angular 的 ErrorHandler DI token -> monitor.capture（唯一错误入口）
          const providers =
            core.ErrorHandler !== undefined
              ? [
                  {
                    provide: core.ErrorHandler,
                    useValue: {
                      handleError: (error: unknown) => ctx.monitor.capture(error, { appId, phase: 'runtime' }),
                    },
                  },
                ]
              : []

          app = await core.createApplication({ providers })
          app.bootstrap(rootComponent, container)
        } catch (error) {
          // async effect 的错误被 cordis 静默吞（task.catch(logger.error)）——宿主与
          // 监控都看不到。此处显式上报再上抛：实验性路线的失败必须可观测。
          ctx.monitor.capture(error, { appId, phase: 'activate' })
          throw error
        }

        return () => {
          app.destroy()
          // 重跑防双挂载（lifecycle §5.7 适配器义务）：destroy 后容器必须已清空；
          // 残留 = 上一次挂载的 DOM 未随 effect 回收，上报后强制清空（宁可重来不可残留）
          if (container.childElementCount > 0) {
            ctx.monitor.capture(
              new Error(`adapter: container not empty after destroy (${container.childElementCount} nodes)`),
              { appId, phase: 'runtime' },
            )
            container.replaceChildren()
          }
        }
      })
    },
  }
}
