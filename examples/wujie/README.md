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

## 一比一还原验证（QA/）

`QA/` 下是一套**跑真实浏览器**的自动化比对工具：同一份用例清单分别跑 4 个目标
（wujie 官方站 ×2 宿主 + 本工程 ×2 宿主），按「布局样式 / 菜单结构 / 功能点覆盖 /
运行时错误」四个维度出差异报告。

```bash
cd QA && npm install
export CHROME_PATH="$HOME/.agent-browser/browsers/chrome-152.0.7977.64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"

npm run serve                                  # 另开终端，起 localhost:7700
node run-suite.mjs official-vue                # 采集 wujie 官方站（vue 宿主）
node run-suite.mjs official-react
node run-suite.mjs taixu-vue                   # 采集本工程
node run-suite.mjs taixu-react
node probe-font.mjs                            # 布局根字体探针（承载元素两侧不同名）
node compare.mjs                               # → gap-report.md
```

产物：`suite.<target>.json`（逐页 DOM / 计算样式 / 菜单树 / 控制台错误）、
`font-probe.json`、`gap-report.md`（P0/P1/P2 分级差异清单）。

三个设计要点，改用例前先读：

- **全部走 SPA 点击导航**，不 goto 深链。官方站深链会让子应用 html 请求 404。
- **菜单结构独立一趟采集**（`collectMenu()`），不夹在用例流程里——官方展开箭头
  `<a-icon @click.native>` 没有 stop 修饰符，点它会连带触发父 router-link 跳转。
- **功能点用同义正则判定**（`lib/cases.mjs` 的 `FEATURES`），不做逐字 token 重合。
  taixu 文案会解释自身语义（同文档 / bus / 保活），逐字比对会大面积误报。

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
