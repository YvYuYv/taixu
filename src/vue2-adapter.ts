/**
 * Vue 2 适配器（heterogeneous-loading.md §4.2/§八 多版本共存，F6 子项）。
 *
 * 与 Vue 3 / Angular 适配器同构：mount/unmount 包成**一次** effect、错误转发、
 * 重跑防双挂载、样式显式登记。Vue 2 特有两条：
 *
 * - **经共享依赖仲裁获取**（`deps.negotiate('vue', range)`）——Vue 2 与 Vue 3 是
 *   registry 的两个条目（§八：`vue@^2` 与 `vue@^3` 互不重叠），框架不硬 import vue2
 *   （不让全体宿主承担其体积；多版本共存是 legacy 路线的核心诉求）
 * - **Vue 2 API 形态**：`new Vue({ render }).$mount(container)` / `$destroy()`
 *   （无 `createApp`；实例即应用）。渲染错误经 `Vue.config.errorHandler`（Vue 2 的
 *   全局错误出口，实例创建前设置）转发 `monitor.capture`（基线 §三 唯一错误入口）
 *
 * 同步 effect：Vue 2 构造是同步 API（无 createApplication 的异步面），与 Vue 3 适配器
 * 同形态；negotiate 的结果在 apply 期解析一次后闭包持有。
 */
import type { Context, Plugin } from 'cordis'
import type { StyleAsset } from './services/style'

/** Vue 2 模块最小面（经 deps 共享依赖取用；框架不 import vue2） */
export interface Vue2Module {
  default?: Vue2Ctor
  Vue?: Vue2Ctor
}

export interface Vue2Ctor {
  config?: { errorHandler?: (err: unknown, vm?: unknown, info?: string) => void }
  new (options: { render: (h: unknown) => unknown }): Vue2Instance
}

export interface Vue2Instance {
  $mount(el: Element): Vue2Instance
  $destroy(): void
  $el?: Element
}

export interface CordisVue2AppOptions {
  appId: string
  /** Vue 2 render 函数（应用侧产出；h 由 Vue 2 注入） */
  render: (h: unknown) => unknown
  /** `vue` 共享依赖版本范围（默认 `^2`——与 Vue 3 应用的 `^3` 互不重叠，§八） */
  vueRange?: string
  styles?: StyleAsset[]
}

/** 一行声明接入（Vue 2 legacy 路线）：返回 Cordis 插件 */
export function defineCordisVue2App(options: CordisVue2AppOptions): Plugin.Object {
  const { appId, render, vueRange = '^2', styles } = options
  return {
    name: appId,
    inject: ['lifecycle', 'monitor', 'style', 'deps'],
    apply(ctx: Context) {
      for (const asset of styles ?? []) {
        ctx.style.inject(ctx, asset)
      }

      let vue2: Vue2Ctor | null = null
      ctx.effect(async () => {
        const container = ctx.lifecycle.containerOf(ctx)
        if (!container) {
          throw new Error(`adapter: no container for app "${appId}" (mount outside lifecycle transaction?)`)
        }

        let instance: Vue2Instance | null = null
        try {
          const shared = await ctx.deps.negotiate('vue', vueRange, { appId, singleton: true, strict: true })
          const mod = shared.module as Vue2Module
          vue2 = (mod.default ?? mod.Vue ?? null) as Vue2Ctor | null
          if (!vue2) throw new Error(`adapter: shared "vue@${vueRange}" module has no Vue constructor`)

          // 错误边界：Vue 2 的全局 errorHandler（实例创建前设置）-> monitor.capture
          vue2.config = vue2.config ?? {}
          vue2.config.errorHandler = (err: unknown) => {
            ctx.monitor.capture(err, { appId, phase: 'runtime' })
          }

          instance = new vue2({ render }).$mount(container)
        } catch (error) {
          // async effect 的错误被 cordis 静默吞——显式上报再上抛（与 Angular 适配器同纪律）
          ctx.monitor.capture(error, { appId, phase: 'activate' })
          throw error
        }

        return () => {
          instance?.$destroy()
          // 重跑防双挂载（lifecycle §5.7 适配器义务）：$destroy 默认不移除 $el（Vue 2 语义）
          if (container.childElementCount > 0) {
            ctx.monitor.capture(
              new Error(`adapter: container not empty after $destroy (${container.childElementCount} nodes)`),
              { appId, phase: 'runtime' },
            )
            container.replaceChildren()
          }
          void vue2
        }
      })
    },
  }
}
