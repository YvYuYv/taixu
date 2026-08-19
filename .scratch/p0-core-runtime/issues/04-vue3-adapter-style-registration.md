# 04 - Vue 3 参考适配器 + 样式节点登记

**What to build:** 一个真实 Vue 3 应用经 `defineCordisApp({ rootComponent })` 一行声明接入并渲染进槽位：适配器把 mount/unmount 包成一次 Cordis effect（无第二套生命周期），应用注入的样式节点全部经登记 API 或 appendChild 自动登记进账本，dispose 时逆序回收、无 DOM 残留。

**Blocked by:** 03

**Status:** resolved

- [x] `defineCordisApp` 入口：rootComponent 声明即可接入（构建插件路径不在本票）
- [x] mount/unmount 包成一次 effect；重跑（服务替换/HMR 语义）时 unmount 校验容器已清空防双挂载
- [x] 样式双通道登记：`ctx.style.inject` 显式 API + Document 代理 appendChild 自动登记（ADR-0033/0042）
- [x] dispose：全部记账节点（含文档级字体例外）逆序移除
- [x] Vue 渲染错误经适配器 errorCaptured 统一转发 monitor.capture
- [x] 主缝集成断言：Vue3 应用挂载/卸载全程 DOM 与监听零残留

## Answer

主缝全链路：`createCordis({ apps: [defineApp(appId, () => defineCordisApp({ appId, rootComponent, styles }))] })` + `host.lifecycle.mount(appId, outlet)` 即把真实 Vue 3 应用渲染进槽位容器，destroy 后 DOM/监听/样式节点零残留。

- `src/vue3-adapter.ts`：`defineCordisApp` 返回 `Plugin.Object`（`inject: ['lifecycle','monitor','style']`），apply 内 `ctx.effect` 把 `createApp + mount` 与 disposer（`app.unmount` + 容器清空校验）包成**一次** effect；`app.config.errorHandler -> ctx.monitor.capture(err, { appId, phase: 'runtime' })`。
- `src/services/style.ts`：StyleService（`static provide = 'style'`）显式通道：`inject(ctx, { file, css })` 打标 `data-cordis-app`/`data-file` 注入 head，同 file 重注入 = css-only 热替换（textContent 替换），移除挂调用方 fiber effect（dispose 逆序）；匿名 fiber fail-closed 拒绝注入。
- 自动兜底通道（02 号票 InjectedNodesTracker + Document 代理 appendChild/insertBefore/append/prepend/innerHTML 拦截）在本票经主缝测试消费：应用经沙箱 `document.head.appendChild(style)` 的注入自动记账、dispose 统一移除。
- `src/services/lifecycle.ts` 两处配套修正：
  1. 容器创建提前到事务开头（首个 await 前），并以 `{ container }` 传给 `sandbox.create` -- 修复 03 号票遗留的 sandbox-missing-container 降级（Document 代理 scoped 查询边界从未接上）；
  2. `containerOf` fiber 判等修正：cordis `ctx.plugin()` 返回 `Object.create(fiber)` 的 thenable 包装，`ctx.fiber` 是原型链上的原 fiber -- 以 `===` 或 `Object.getPrototypeOf(instance.fiber) === ctx.fiber` 判等。
- 测试 `tests/vue3-adapter.test.ts`（7 例）：一行声明渲染、effect 包装 dispose 回收、主缝零残留（DOM 计数 + 探测事件派发验证监听解绑）、errorHandler 转发（phase=runtime、appId 归因）、显式样式登记/移除、沙箱自动兜底记账/移除、重跑防双挂载（mounts 计数 + 根节点唯一）。

全量 55/55 绿（`npx vitest run`），`npx tsc --noEmit` 通过。

## Comments

- **code-review 双轴发现与修复**：
  - Standards：`@vue/test-utils` 从未使用（已移除）；adapter 末尾竞态防护块 `if (unmounted && cleanup) cleanup?.()` 不可达且 mistranslate 文档 §4.1 的 `update(container)` 竞态形状（已删）；style.inject 匿名 fiber 落 `unknown` 槽改为 fail-closed 抛错；两处冗余 `pendingContainers.set` + 魔法分隔符 `\u0000` 复合键（随兜底表整体删除，见下）。
  - Spec：容器预注册兜底 `pendingContainers` 按 appId 匹配存在跨槽位错配（同 appId 双槽位并发），且 loadApp 失败路径泄漏容器/表项 -- 深挖后发现**真根因是 fiber 判等**（plugin() 返回包装对象）；修复判等后实例表主查找即可满足 apply 时序（plugin() 返回后同步登记，apply 在其后的微任务跑），整个预注册表删除（Speculative Generality）。
  - unmount 清空校验原实现静默 `replaceChildren()`（reviewer："no teeth"）-- 改为上报 monitor.capture 后强制清空。
  - "监听零残留"原测试只数 DOM 节点 -- 补充 ctx.effect 注册 document 监听 + 探测事件派发断言解绑。
  - onErrorCaptured 返回 false 会吞掉 app.config.errorHandler（Vue 语义：返回 false 阻止继续传播）-- 测试改为根组件 setup 抛错直冒 errorHandler，注释说明该拦截属应用裁决权。
- **字体例外未实现**（checkbox 4 的括号项）：@font-face 文档级例外提级属 style-isolation P1（构建期扫描），本票记账/移除通道就绪后 P1 只需在 InjectedNodesTracker.maybeRecord 加例外清单，框架改动面为零。
- cordis v4 API 事实追加：`ctx.plugin()` 返回 `Object.create(fiber)` 的包装（自带 then，`await fiber` 有效）；任何持有 plugin() 返回值做 fiber 身份比较的代码必须走原型链（containerOf 已修；后续 bus/state 服务的 per-fiber 记账同样适用）。
