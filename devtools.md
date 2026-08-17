# Cordis 开发调试工具（DevTools）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)。
> 原则：DevTools 是 monitor 采集数据的**只读消费者 + 命令注入器**，不重复采集（旧版与 monitoring 重复实现 FPS/内存采集、双份常驻循环全部废除）。

## 一、问题分析

| 问题 | 表现 |
|------|------|
| 多应用状态难追踪 | 多应用同屏互相影响 |
| 通信链路不清晰 | 消息传递不可视化 |
| 性能瓶颈定位难 | 不知道哪个应用导致 |
| 错误来源不明确 | 归因不清 |
| 热更新复杂 | 多应用热更冲突 |

现有工具（Vue/React/Redux DevTools）均为单应用/单框架；Chrome DevTools 无微前端特化。

## 二、架构（单一传输通道，修复四套断链机制）

旧版同时存在四种互不衔接的通道（window 对象方法 / CustomEvent 无 dispatch 方 / panel window.message 到不了扩展页 / runtime.sendMessage 到不了 content script）。统一为**一条链路**：

```
┌─ 页面（main world）─┐      ┌── content script ──┐      ┌─ panel（扩展页）──┐
│ cordis devtools 端点 │ <--> │ chrome.runtime     │ <--> │ chrome.runtime    │
│ CustomEvent 双向     │      │  .port（长连接）    │      │  .port 连接       │
└─────────────────────┘      └────────────────────┘      └───────────────────┘
```

```typescript
// 1) 页面端：devtools agent（仅开发模式注入；生产构建不包含）
class DevtoolsAgent {
  private enabled = false
  constructor(private ctx: Context) {
    // 双向 CustomEvent：content script 同 world 监听（page -> 扩展）
    ctx.effect(() => {
      const onCommand = (e: CustomEvent<DevtoolsCommand>) => this.handle(e.detail)
      addEventListener('cordis-devtools-command', onCommand)          // 扩展 -> 页面
      return () => removeEventListener('cordis-devtools-command', onCommand)
    })
  }
  private emit(event: DevtoolsEvent) {
    if (!this.enabled) return     // 面板未打开不推送（但仍消费 monitor 快照，见 §四门控）
    dispatchEvent(new CustomEvent('cordis-devtools-event', { detail: event }))
  }
}

// 2) content script（manifest v3）：
chrome.runtime.onConnect.addListener((port) => {
  addEventListener('cordis-devtools-event', (e: Event) => port.postMessage((e as CustomEvent).detail))
  port.onMessage.addListener((cmd) => dispatchEvent(new CustomEvent('cordis-devtools-command', { detail: cmd })))
})

// 3) devtools.html -> devtools.js（旧版缺失的注册）：
chrome.devtools.panels.create('Cordis', 'icon.png', 'panel.html')

// 4) panel.js：chrome.runtime.connect() 与 content script 建立长连接（不再监听 window message）
```

- 生产禁用：agent 由构建插件按 `import.meta.env.DEV` 摇树移除；运行时 `window.__CORDIS_DEVTOOLS__` 全局句柄**废除**（任何页面脚本可占位窃听，security 基线），通道即 CustomEvent
- 面板关闭 -> agent.enabled=false -> 采集照常（monitor 主导）但**不推送**

## 三、数据源（全部复用 monitor）

| 面板 | 数据源 |
|------|--------|
| 应用列表/状态/依赖 | `lifecycle.getAppState`（唯一同步 API）+ fiber 树 |
| 性能（FPS/内存/长任务） | `monitor.snapshot()`（不重复注册 PerformanceObserver/rAF） |
| 消息流 | 根 ctx `global:true` 订阅 `message/send` / `message/receive`（仅元数据：id/type/source/target/size；载荷经显式开关 + 脱敏管道） |
| 状态树 | state 服务只读接口（三层键空间分组；敏感键掩码）+ state/changed 流 |
| 错误 | monitor 错误清单（已归因 appId + sourcemap 还原栈） |
| 网络 | bus.network 链路的记录视图（URL/状态/耗时/traceparent） |

旧版 LifecycleCollector 自注册 8 个监听且 stop 不注销、monitorMemory 的 setInterval 不存句柄等问题随"不重复采集"原则一并消除。

## 四、渲染安全（XSS 全量修复，不再是单点修补）

```typescript
// 所有面板统一经 safeRender（旧版消息面板修了 XSS，state/errors 面板仍 innerHTML 直接插值）
function renderValue(el: HTMLElement, value: unknown) {
  const pre = document.createElement('pre')
  pre.textContent = JSON.stringify(value, replacer, 2)   // textContent：错误消息/栈/状态值一律转义
  el.replaceChildren(pre)
}
// 应用列表的 appId 等插值同样走 textContent；无任何模板字符串进 innerHTML
```

## 五、命令通道（能力清单）

| 命令 | 行为 |
|------|------|
| `app.reload` | 走 hmr 服务（§六），不直接操作 lifecycle |
| `app.suspend / resume` | lifecycle 保活操作（手动验证冻结语义） |
| `state.inspect` | 读取指定键（敏感键返回掩码） |
| `message.pause / resume / filter / export` | 消息录制控制（暂停/恢复/过滤/导出 JSONL） |
| `monitor.snapshot` | 拉取快照 |

- 命令鉴权：agent 校验命令来源（CustomEvent detail 含 port 下发的 nonce；生产模式 agent 不存在）
- 命令处理器全部挂 agent 的 ctx.effect（页面卸载自动清理）

## 六、HMR（统一入口，语义分级）

```typescript
class HmrService extends Service {
  static [Context.provide] = 'hmr'   // 仅开发模式注册

  onFileChanged({ appId, files }: ChangeSet) {
    const kinds = classify(files)   // css / js / manifest
    if (kinds.css) styles.hotSwap(appId, files)                    // 真热替换（style-isolation §七，零状态损失）
    if (kinds.js) this.reloadApp(appId)                            // 整应用重启（fiber.dispose -> 重挂载）
    if (kinds.manifest) deps.invalidateManifest(appId)
  }

  async reloadApp(appId: string) {
    // 与 module-interaction §2.5 相同流程：
    // fiber.dispose（回收全部 effect/监听）-> deps.invalidateModuleCache(appId, changed)（import() 缓存穿透）
    // -> lifecycle.mount（走完整事务，含导航协调：router 当前槽位位置保持不变）
    // 语义诚实声明：JS 变更 = 状态不保留的整应用重启（不做跨 HMR 状态迁移的假承诺）
    // 与导航竞态：reload 前检查 NavigationController 序号，导航在途则推迟至导航完成
  }
}
```

- Vite 集成：dev server ws 地址从 `import.meta.env` 注入（不硬编码 localhost）；断线重连；webpack HMR 适配（P1，覆盖 Vue2/webpack 子应用）
- `matchFilesToApps`：真实实现（构建期生成的 appId -> 模块清单映射，来自 deps manifest）

## 七、面板功能规格

| 面板 | 内容 | 旧版差距修复 |
|------|------|--------------|
| Applications | fiber 树、状态（PENDING/ACTIVE/…/Suspended）、依赖服务、耗时 | 状态源唯一（getAppState） |
| Messages | 时间线（元数据）、request/response 配对（correlationId）、暂停/过滤/导出 | 旧版无录制控制；载荷不默认采集 |
| State | 三层键空间树 + 当前值 + 变更历史（环形） | 旧版只显示最后一条变化，无当前树 |
| Performance | 复用 monitor 快照的 FPS/内存/长任务，按 appId 下钻 | 唯一采集源 |
| Errors | 归因 appId + sourcemap 还原栈 + traceparent 跳转 | 旧版只消费 lifecycle:error，普通 JS 错误不可见 |
| Network | bus.network 记录视图 | 旧版无 |

- 缓冲：环形缓冲 + 批量推送（rAF 合帧；旧版每事件同步 postMessage）
- "面板未打开不推送"门控（§二），采集成本归 monitor 统一预算

## 八、性能

- 推送节流：每帧至多一次批量 emit
- 面板虚拟滚动（消息/状态树大列表）
- 体积：agent < 10KB（gzip），仅 DEV 构建注入

## 九、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | 单通道传输链（agent/content/port/panel）+ 生产摇树 + XSS 安全渲染 |
| P0 | Applications/Messages 面板（复用 monitor/state 数据源） |
| P1 | State/Performance/Errors/Network 面板、命令通道（reload/suspend/录制控制） |
| P1 | HmrService（css 真热替换 + js 整重启 + 导航协调）、Vite 集成 |
| P2 | webpack HMR、消息导出、虚拟滚动优化 |

## 十、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| D-1 采集不接 Cordis/stop 不注销/interval 不存句柄 | §三 不重复采集（monitor 唯一源）+ agent ctx.effect |
| D-2 与 monitoring 重复实现 | §三 数据源表 |
| D-3 四套传输机制互不相通 | §二 单一链路（CustomEvent <-> port） |
| D-4 `delete window.__CORDIS_DEVTOOLS__` 无效禁用 | 构建期摇树 + 无全局句柄 + nonce 命令鉴权 |
| D-5 XSS 双标（state/errors 面板注入） | §四 全量 textContent |
| D-6 HMR 冷更新/与导航无协调/webpack 缺失 | §六 分级语义 + 序号协调 + P1 webpack |
| D-7 功能承诺与实现落差 | §七 面板规格表逐项落实 |
| D-8 O(n) shift/无门控 | 环形缓冲 + 批量 + 面板门控 |
