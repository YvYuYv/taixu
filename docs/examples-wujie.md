# wujie 场景全集示例（examples/wujie）

> 场景架构对齐 [wujie 官方示例](https://github.com/Tencent/wujie/tree/master/examples)（2 宿主 × 6 异构子应用），
> **全部以 @taixu/core 原生机制实现，不含任何 wujie 代码与配置**。
> 两框架全方位能力对比见 [COMPARISON.md](https://github.com/taixu-micro/taixu/blob/main/examples/wujie/COMPARISON.md)。

## 在线运行

| 宿主 | 入口 | 亮点 |
| --- | --- | --- |
| React 18 宿主 | [main-react](https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-react/) | HashRouter 多页路由、6 应用同屏（all）、子应用嵌套（nest）、跨应用跳转、Home 页预加载开关 |
| Vue 3 宿主 | [main-vue](https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-vue/) | multiple 六应用同屏、postmessage 双向消息闭环 |

<sup>提示：首次进入若子应用较多，加载需要数秒；Home 页可先点「预加载」全量预热。</sup>

## 覆盖场景

| 子应用 | 技术栈 | 演示能力 |
| --- | --- | --- |
| react16 | React 16.13（独立副本） | 多版本 React 同页共存；Portal 弹窗（append 到 body 原生可用）；nest 页演示子应用内再起运行时 |
| react17 | React 17.0.2 | 保活计数（跨切换状态保持）、跨应用 state 联动 |
| vue2 | Vue 2.7 | adapter-vue2 接入、deps 共享依赖仲裁（vue 单例）、富文本、postmessage |
| vue3 | Vue 3 | adapter-vue3 接入、state / inline-event / postmessage |
| vite | Vite lib mode | 构建工具差异化（真实 Vite 工程产出 ESM Plugin） |
| angular12 | Angular 17 standalone + AOT | adapter-angular 接入、deps 单例仲裁 |

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
| 子应用嵌套 | 子应用内再起一个 taixu 运行时（react16 nest 页） |

## 本地运行

源码位于仓库 [`examples/wujie/`](https://github.com/taixu-micro/taixu/tree/main/examples/wujie)：

```bash
cd examples/wujie
npm install          # 根依赖 + 各子应用独立安装（postinstall 自动执行）
npm run build        # 全量构建 → dist/
npm run serve        # http://localhost:7700/hosts/main-react/ 与 /hosts/main-vue/
```
