/**
 * 状态框架适配器最小集（state-sharing §六，S2-5）：
 * - 适配器只消费**写入管线**事件（`ctx.state.watch`）——无双通道同步、无手动 emit
 *   广播；变更事件只由写入管线发出
 * - Vue3：`useSharedState`（shallowRef + watch，订阅托管给 ctx.effect）
 * - Vue2：`defineSharedState`（defineProperty 兼容层——`current` 为预定义访问器，
 *   Vue2 defineReactive 可在既有 getter/setter 上挂 dep；写走唯一写管线）
 * - React 适配（useSharedState/useCordis + Provider）需 react 运行时，随独立票落地
 *
 * C3 wiring：set/get 经 bindLocal helper（state 层管理"自身写不回调"的统一机制）；
 * 删除 Vue2 路径中的 `writing` 闭包标志（三处 adapter 公用同一 helper）。
 */
import { shallowRef, type Ref } from 'vue'
import type { Context } from 'cordis'

/**
 * Vue3 适配（§六样例代码同形）：shallowRef 持当前值；订阅经 ctx.state.watch
 * 托管（应用卸载自动退订）；set 走 bindLocal（自带 self-write 短路）。
 */
export function useSharedState<T>(ctx: Context, key: string, appId: string): { state: Ref<T>; set: (v: T) => void } {
  const state = shallowRef<T>(ctx.state.get(key, { appId }) as T)
  // C3 wiring：opt-in self-write 短路（adapter 内部 watch 自带 filter；避免与框架 reactive 同值短路冲突）
  ctx.state.watch(ctx, key, (v) => {
    state.value = v as T
  }, { appId, filterSelfWrite: true })
  // C3 wiring：set 经 bindLocal helper（自写短路 + 权限按 appId 一体裁决）
  const local = ctx.state.bindLocal<T>(ctx, key, appId)
  return { state, set: local.set }
}

/**
 * Vue2 defineProperty 兼容层：返回 `current` 为预定义访问器的盒子（可直接入
 * Vue2 data()——Vue2 对访问器属性会保留既有 getter/setter 并挂 dep，不触发
 * "无法检测属性新增"缺陷）。写：走唯一写管线（appId 归因，自身写不回调
 * onChange——bindLocal helper 短路）；读：watch 闭包回放外部变更。
 */
export function defineSharedState<T>(ctx: Context, key: string, appId: string, onChange?: () => void): { current: T } {
  let current = ctx.state.get(key, { appId }) as T
  let primed = false // watch 首跑送当前值（§4.3）不算变更
  // C3 wiring：opt-in self-write 短路 + 删除本地 writing 闭包
  ctx.state.watch(ctx, key, (v) => {
    current = v as T
    if (primed) onChange?.() // bindLocal 已短路自写——这里只看外部变更
    primed = true
  }, { appId, filterSelfWrite: true })
  // C3 wiring：set 经 bindLocal helper（删自维护的 writing 闭包——helper 已含)
  const local = ctx.state.bindLocal<T>(ctx, key, appId)
  const box = {} as { current: T }
  Object.defineProperty(box, 'current', {
    enumerable: true,
    get: () => current,
    set: local.set, // access 写入路径走 bindLocal.set（自写短路；其他应用写仍正常通知）
  })
  return box
}

