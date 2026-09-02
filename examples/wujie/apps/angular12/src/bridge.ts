/** angular 子应用与 taixu ctx 的模块级桥（main.ts 装配，组件 ngOnInit 认领 setPage） */
export const bridge: any = {
  ctx: null,
  setPage: null as null | ((p: string) => void),
  notify: null as null | ((page: string) => void),
  /** 跳转其它子应用（= wujie props.jump，经 bus broadcast） */
  jump(name: string) {
    bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name } })
  },
  /** bus 事件（宿主全局旁听后 alert） */
  click() {
    bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'click', payload: 'angular12' })
  },
}
