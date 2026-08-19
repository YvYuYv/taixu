/**
 * Vue 3 参考适配器（heterogeneous-loading.md §四）：
 * - `defineCordisApp({ appId, rootComponent, styles })` 一行声明接入
 * - mount/unmount 包成**一次** effect（无第二套生命周期；dispose 自动回收）
 * - 渲染错误经 app.config.errorHandler 统一转发 monitor.capture（phase='runtime'）
 * - 重跑（服务替换/HMR 语义）时 unmount 清理器校验容器已清空防双挂载
 * - styles 经 ctx.style.inject 显式登记（ADR-0033）
 *
 * 构建插件路径（ESM 工厂包裹 globalThis 注入）不在本票（spec Out of Scope）。
 */
import { createApp, type Component } from 'vue'
import type { Context, Plugin } from 'cordis'
import type { StyleAsset } from './services/style'

export interface CordisAppOptions {
  appId: string
  rootComponent: Component
  /** 显式样式声明（经 ctx.style.inject 登记；第三方库的 head 注入走沙箱自动兜底） */
  styles?: StyleAsset[]
}

/**
 * 一行声明接入：返回 Cordis 插件，经 defineApp(appId, () => plugin) 进宿主清单。
 * 适配器职责只有"把 Vue 的 mount/unmount 包成一次 effect"。
 */
export function defineCordisApp(options: CordisAppOptions): Plugin.Object {
  const { appId, rootComponent, styles } = options
  return {
    name: appId,
    inject: ['lifecycle', 'monitor', 'style'],
    apply(ctx: Context) {
      // 显式样式登记（ADR-0033；effect 随 dispose 逆序移除）
      for (const asset of styles ?? []) {
        ctx.style.inject(ctx, asset)
      }

      ctx.effect(() => {
        const container = ctx.lifecycle.containerOf(ctx)
        if (!container) {
          throw new Error(`adapter: no container for app "${appId}" (mount outside lifecycle transaction?)`)
        }

        const app = createApp(rootComponent)
        // 渲染错误统一转发 monitor.capture（基线 §三 唯一错误入口）
        app.config.errorHandler = (err) => {
          ctx.monitor.capture(err, { appId, phase: 'runtime' })
        }
        app.mount(container)

        return () => {
          app.unmount()
          // 重跑防双挂载（lifecycle §5.7 适配器义务）：unmount 后容器必须已清空；
          // 残留 = 上一次挂载的 DOM 未随 effect 回收，上报后强制清空（宁可重来不可残留）
          if (container.childElementCount > 0) {
            ctx.monitor.capture(
              new Error(`adapter: container not empty after unmount (${container.childElementCount} nodes)`),
              { appId, phase: 'runtime' },
            )
            container.replaceChildren()
          }
        }
      })
    },
  }
}
