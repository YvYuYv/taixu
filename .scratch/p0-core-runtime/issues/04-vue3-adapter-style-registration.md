# 04 - Vue 3 参考适配器 + 样式节点登记

**What to build:** 一个真实 Vue 3 应用经 `defineCordisApp({ rootComponent })` 一行声明接入并渲染进槽位：适配器把 mount/unmount 包成一次 Cordis effect（无第二套生命周期），应用注入的样式节点全部经登记 API 或 appendChild 自动登记进账本，dispose 时逆序回收、无 DOM 残留。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `defineCordisApp` 入口：rootComponent 声明即可接入（构建插件路径不在本票）
- [ ] mount/unmount 包成一次 effect；重跑（服务替换/HMR 语义）时 unmount 校验容器已清空防双挂载
- [ ] 样式双通道登记：`ctx.style.inject` 显式 API + Document 代理 appendChild 自动登记（ADR-0033/0042）
- [ ] dispose：全部记账节点（含文档级字体例外）逆序移除
- [ ] Vue 渲染错误经适配器 errorCaptured 统一转发 monitor.capture
- [ ] 主缝集成断言：Vue3 应用挂载/卸载全程 DOM 与监听零残留
