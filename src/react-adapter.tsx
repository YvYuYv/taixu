/**
 * React 适配器（state-sharing §六样例同形，P1）：
 * - `CordisProvider`：应用 ctx 经 React Context 注入（**不是全局单例**——旧病根）
 * - `useCordis()`：取 ctx/appId（Provider 缺失显式抛错）
 * - `useSharedState(key)`：useState + useEffect 订阅（组件卸载经 watch 退订句柄
 *   归还——§六"组件级订阅仍由框架 hook 自身管理，但都以 ctx 为宿主"）；
 *   set 经唯一写管线带 appId 归因；适配器只消费写入管线事件（S2-5 双通道废除）
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import type { Context } from 'cordis'

interface CordisReactScope {
  ctx: Context
  appId: string
}

const CordisReactContext = createContext<CordisReactScope | null>(null)

export function CordisProvider(props: CordisReactScope & { children: ReactNode }) {
  const value = useMemo(() => ({ ctx: props.ctx, appId: props.appId }), [props.ctx, props.appId]) // context value 引用稳定（消费树免整体重渲染）
  return <CordisReactContext.Provider value={value}>{props.children}</CordisReactContext.Provider>
}

export function useCordis(): CordisReactScope {
  const scope = useContext(CordisReactContext)
  if (!scope) throw new Error('useCordis: no CordisProvider in tree (ctx is not a global singleton)')
  return scope
}

export function useSharedState<T>(key: string): [T, (v: T) => void] {
  const { ctx, appId } = useCordis()
  const [value, setValue] = useState<T>(() => ctx.state.get(key, { appId }) as T) // 首读带归因（与投递检查对齐，fail-closed）
  useEffect(() => {
    // 组件级订阅（hook 内自管理）：卸载经退订句柄归还（state.watch 返回 off）
    return ctx.state.watch(ctx, key, (v) => setValue(v as T))
  }, [ctx, key])
  const set = useCallback((v: T) => ctx.state.set(key, v, { appId }), [ctx, key, appId])
  return [value, set]
}
