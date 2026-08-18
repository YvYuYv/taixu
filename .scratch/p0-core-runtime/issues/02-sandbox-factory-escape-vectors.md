# 02 - 沙箱工厂 + 逃逸向量缓解

**What to build:** 探针应用运行在注入过的 globalThis（双窗口 Proxy 沙箱）中：它对 window 的写入被隔离、dispose 后全部回收；10 项逃逸向量（constructor 链 / getPrototypeOf / unscopables / Worker / ServiceWorker / 网络面等，见 js-sandbox 逃逸向量表）各自有清单化缓解。沙箱每应用实例化、不池化。

**Blocked by:** 01（探针应用与测试基座）

**Status:** resolved

- [x] 双窗口 Proxy：trap 语义正确、has 恒 true、location 读写统一重定向 router
- [x] 逃逸向量 10 项逐一缓解并有工厂直测（本票为唯一允许的服务级直测缝）
- [x] Document 代理 scoped 查询 + 全路径注入记账（样式 appendChild 自动登记的挂点，登记语义在 04 验收）
- [x] 存储命名空间接线（真前缀，非空壳）
- [x] 沙箱创建动作挂 effect（dispose 幂等双保险：lifecycle 显式 + fiber effect）
- [x] 定位声明可见：沙箱是污染隔离不是安全边界

## Answer

已交付（`npm test` 33/33 绿，tsc 0 错）：

- `src/sandbox.ts` `createSandbox(ctx, appId, options)`：双窗口 Proxy 沙箱工厂。
  - 逃逸向量 10 项逐一缓解：#1 eval/Function 记账包装（执行经宿主 CSP 兜底）；#2 `hardenFunction` 冻结包装函数 constructor/`__proto__`/prototype（受控 constructor 只记账+告警，**不转发 raw.apply**）；#3 `Object.create(null)` 基座 + `getPrototypeOf` trap 返回 null；#4 `has` 恒真 + `Symbol.unscopables` 返回 undefined；#5 top/parent 返回沙箱自身、document.defaultView 受控；#6 动态 import 归 deps 白名单（沙箱属性面不暴露）；#7 Worker/SharedWorker 记账包装、SW 注册面遮蔽+告警；#8 XHR/WS/EventSource/sendBeacon 记账包装（**过渡实现**，唯一链路 bus.network 在 07 号票回收）；#9 customElements per-app registry 前缀重注册+告警；#10 history.pushState/replaceState 重定向受控导航。
  - 黑名单 `__CORDIS_*` **前缀整体封禁**（非逐字面量）；location 写入统一重定向（router 未接线时显式 `sandbox-navigate-unwired` 告警，不静默吞）。
  - 受控视图（location/history/navigator/customElements/localStorage/sessionStorage）缓存单例，身份稳定。
  - `modifiedKeys()` 记账污染键；destroy 幂等（移除本应用记账节点 + onDestroy）。
- `src/document-proxy.ts` + `src/inject-tracker.ts`：scoped 查询（getElementById 显式实现、querySelector 族限定容器、无容器=空查询面）；head/body 稳定单例**代理**（拦截 appendChild/insertBefore/append/prepend/replaceChildren/innerHTML/insertAdjacentHTML 记账，**真实节点零改写**，多应用互不踩踏）；document.write 禁用+告警。
- `src/storage.ts`：StorageNamespace 真 Proxy 完整 Storage 语义（命名属性读写、length/key 经**缓存枚举**不做全表扫描、写操作失效缓存），前缀统一 `__cordis__${appId}__`。
- `src/custom-elements.ts`：per-app registry（jsdom 的 get 返回 undefined 非 null 已适配）。
- `src/services/sandbox.ts`：SandboxService（`static provide`、`inject = ['security','monitor']`），挂入 `createCordis()`。
- `tests/sandbox.test.ts`：沙箱工厂直测（本票唯一服务级直测缝）；jsdom 能力面内做行为断言，环境缺失面用"有则包装/无则缺失"条件断言 + stub 验证遮蔽逻辑。

验收备注：

- "创建动作挂 effect"的完整接线（`fiber.ctx.effect(() => () => sandbox.destroy())`）在 lifecycle 挂载事务内（03 号票，js-sandbox §4.1）；本票交付 destroy 幂等原语 + onDestroy 回调双保险，票内直测幂等性。
- 向量 #7 的 SW 告警在 jsdom 下无 SW 面（stub 测试验证遮蔽+告警逻辑，Chromium 下走真分支）。

## Comments

- **/code-review 双轴结论（均已修复或注明边界）**：
  - Standards 硬违规：容器创建改为"不代建"（无容器=空查询面+告警；唯一路径 createOutletContainer 在 03 号票）；storage length/key 全表扫描改缓存枚举；网络面包装注明**过渡实现**边界（07 号票 bus.network 唯一链路后回收）；`inject security` 装饰性注明（沙箱创建权限校验随 lifecycle 03 号票消费点一起接线）。
  - Spec 错实现修复：Worker/SharedWorker 裸透传改记账包装；hardenFunction 受控 constructor 不再 raw.apply（封"字符串透传=未记账间接 eval"洞）；head/body 从"变异真实节点"改为纯代理层拦截（innerHTML 拦截移到 **set trap**--get trap 返回 `{get,set}` 对象会退化为字符串赋值，实测踩坑）；黑名单前缀化；受控视图身份稳定；destroy 补 modifiedKeys 诊断接口。
  - 死代码清理：destroyedCount、`getPrototypeOf` 属性分支、Tracker 别名导出、双导出面收敛到 index。
- 原型 freeze 策略（js-sandbox §3.3）按 §八实施计划属 **P2** 不在本票；且实测进程级 `Object.freeze(Object.prototype)` 在共享测试进程会破坏宿主自身机制，将来落地必须由宿主启动期显式开启。
