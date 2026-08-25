/**
 * 状态框架适配器最小集（state-sharing §六，S2-5）：
 * - 适配器只消费**写入管线**事件（`ctx.state.watch`）——无双通道同步、无手动 emit
 *   广播；变更事件只由写入管线发出
 * - Vue3：`useSharedState`（shallowRef + watch，订阅托管给 ctx.effect）
 * - Vue2：`defineSharedState`（defineProperty 兼容层——`current` 为预定义访问器，
 *   Vue2 defineReactive 可在既有 getter/setter 上挂 dep；写走唯一写管线）
 * - React 适配（useSharedState/useCordis + Provider）需 react 运行时，随独立票落地
 */
import { shallowRef, type Ref } from 'vue'
import type { Context } from 'cordis'

/**
 * Vue3 适配（§六样例代码同形）：shallowRef 持当前值；订阅经 ctx.state.watch
 * 托管（应用卸载自动退订）；set 走唯一写管线并带 appId 归因。
 */
export function useSharedState<T>(ctx: Context, key: string, appId: string): { state: Ref<T>; set: (v: T) => void } {
  const state = shallowRef<T>(ctx.state.get(key) as T)
  ctx.state.watch(ctx, key, (v) => {
    state.value = v as T
  })
  const set = (v: T) => ctx.state.set(key, v, { appId })
  return { state, set }
}

/**
 * Vue2 defineProperty 兼容层：返回 `current` 为预定义访问器的盒子（可直接入
 * Vue2 data()——Vue2 对访问器属性会保留既有 getter/setter 并挂 dep，不触发
 * "无法检测属性新增"缺陷）。写：走唯一写管线（appId 归因，自身写不回调
 * onChange——Vue2 setter 自身的 dep.notify 已覆盖重渲染）；读：watch 闭包回放
 * 外部变更（外部写 -> 写入管线 -> watch -> 闭包更新 + onChange 通知应用侧重渲染钩子）。
 */
export function defineSharedState<T>(ctx: Context, key: string, appId: string, onChange?: () => void): { current: T } {
  let current = ctx.state.get(key) as T
  let primed = false // watch 首跑送当前值（§4.3）不算变更
  let writing = false // 自身写（盒子 setter -> 写入管线 -> watch 同步回环）不算"外部"变更
  ctx.state.watch(ctx, key, (v) => {
    current = v as T
    if (primed && !writing) onChange?.() // 外部变更通知（dep.notify 桥，应用侧传入）
    primed = true
  })
  const box = {} as { current: T }
  Object.defineProperty(box, 'current', {
    enumerable: true,
    get: () => current,
    set: (v) => {
      writing = true
      try {
        ctx.state.set(key, v, { appId })
      } finally {
        writing = false
      }
    },
  })
  return box
}
