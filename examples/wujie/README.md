# taixu 官方示例集（对齐 Tencent/wujie examples 的场景全集）

> 本目录是 [taixu](https://github.com/taixu-micro/taixu) 的官方示例工程。场景架构对齐
> [wujie 官方示例](https://github.com/Tencent/wujie/tree/master/examples)（2 宿主 × 6 异构子应用），
> **全部以 @taixu/core 原生机制实现，不含任何 wujie 代码与配置**。两框架能力对比见
> [COMPARISON.md](./COMPARISON.md)。

## 结构

```
hosts/
  main-react/          React 18 宿主（HashRouter，6 应用 + all 同屏 + 子菜单）
  main-vue/            Vue 3 宿主（multiple 同屏 + postmessage 双向消息）
  shared/host-core.ts  宿主共用运行时核心（槽位编排 / 路由同步 / 预加载 / 样式管线）
apps/
  react16/             React 16.13 独立副本（多版本 React 共存；nest 页演示子应用嵌套）
  react17/             React 17.0.2（保活计数 + 跨应用 state 联动）
  vue2/                Vue 2.7（deps 共享依赖仲裁接入；postmessage / rich-text）
  vue3/                Vue 3（adapter-vue3 接入；state / inline-event / postmessage）
  vite/                Vite lib mode 构建工具差异化
  angular12/           Angular 17 standalone + AOT（adapter-angular + deps 单例仲裁）
```

## 运行

```bash
npm install          # 根依赖 + 各子应用独立安装（postinstall 自动执行）
npm run build        # 全量构建 → dist/
npm run serve        # http://localhost:7700/hosts/main-react/ 与 /hosts/main-vue/
```

单跑 Angular：`npm run build:angular`。

## wujie 场景 → taixu 实现映射

| wujie 场景 | taixu 实现 |
| --- | --- |
| `<WujieVue name url>` 加载子应用 | 动态 import 远程 ESM（default export = Plugin） |
| 保活（keepAlive） | `lifecycle.switch`（suspend/resume，状态保留） |
| 多实例同屏（Multiple/All） | 多槽位 `lifecycle.mount(id, outlet)` 共存 |
| `props.jump` 跨应用跳转 | `bus.broadcast('navigate', …)` + 宿主旁听 |
| `window.parent` 全局方法 | 同文档同窗，直接调用 |
| EventBus 去中心化通信 | 鉴权总线（`bus.broadcast` / `bus.send` / `message/send` 旁听） |
| `sync` 路由同步 | `sub-route-change` 上行 + 定向 `*-router-change` 下行 |
| preloadApp 预加载预执行 | 动态 import 全量预热（Home 页开关） |
| postMessage 消息中继 | `bus.send` 定向消息 + 应答（无 iframe 无中继） |
| cssBeforeLoaders/cssAfterLoaders | `ctx.style.inject` 样式管线（withStylePipeline 包装） |
| 弹窗 append 到 body | 同文档渲染，Portal/Teleport/append 原生可用 |
| @font-face 字体处理 | 同文档，字体原生加载，零框架介入 |
| 降级（degrade） | 不适用（无 iframe 依赖，无降级概念） |
| 子应用嵌套 | 子应用内再起一个 taixu 运行时（react16 nest 页） |
