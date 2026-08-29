# 生命周期与保活

## 应用状态机

应用状态从 Cordis Fiber 状态机派生：`PENDING → LOADING → ACTIVE →（SUSPENDED）→ DISPOSED`，不存在平行状态机。查询：

```typescript
host.lifecycle.getAppState(instanceId)   // 'active' | 'suspended' | ...
host.lifecycle.getInstances()            // 实例表
```

## 挂载

```typescript
const inst = await host.lifecycle.mount('cart-app', 'main', {
  signal: abortController.signal,   // AbortSignal 全程透传（加载期可取消）
  config: { locale: 'zh' },         // 应用配置
})
```

挂载事务：容器在事务开头创建（首个 await 前）→ 资源加载（deps）→ SuspendScope 注册 → 沙箱创建 → 应用激活 → 事件广播。任一步失败自动回滚（沙箱/容器/登记回收），错误上抛并进 monitor。

## 切换事务（消除"卸 A 挂 B，B 失败页面悬空"）

```typescript
await host.lifecycle.switch('main', 'pay-app')
```

三步收口：目标应用先 `mountHidden` 挂**隐藏容器** → 挂载成功后才让位当前应用 → 末步 `reveal` 显示。

- 消除切换期间的闪烁与中间态；B 挂载失败时 A 仍在原位（不留悬空窗口）
- `reveal` 置于 `finally`：让位失败也照常显示新应用（宁可残留，不留空白）
- 原应用默认**挂起保活**（回程零冷启动）；应用声明 `keepAlive: false` 则直接 dispose

## 保活池（LRU + 内存水位）

```typescript
createCordis({
  keepAlive: {
    maxCount: 5,        // 数量上限（主），超限 LRU 驱逐
    ttlMs: 10 * 60_000, // 单实例最长保活（后台标签页计时暂停，可见性恢复补算）
  },
})
```

- 内存水位（Chromium）：`usedJSHeapSize / jsHeapSizeLimit > 0.85` 按 LRU 驱逐；Firefox/Safari 优雅退化为纯数量上限
- 驱逐决策在 `requestIdleCallback` 中执行，不卡切换关键路径
- LRU 键 = `lastAccessAt`（resume/message 均刷新）

## 分级挂起

挂起不是单一开关，是**带来源的仲裁账本**（`suspendSources`）：路由切换、手动请求、killswitch 各有优先级；恢复（resume）解除全部低优先级挂起。

## 驱逐快照：冷启动 → 暖启动

驱逐是 dispose（状态全丢），但用户切回被驱逐页签不应看到白屏表单丢失：

- `keepAlive: 'state'` 模式驱逐前快照入池（sessionStorage，压缩存储）
- 重挂载时注水恢复——重挂载自动暖启动

## 销毁

```typescript
await host.lifecycle.destroy(instanceId, 'caller')   // 单实例
await host.lifecycle.destroyByAppId('cart-app', 'caller') // 按应用（KillSwitch 用同一入口）
```

dispose 抛错**不再吞掉清理**：`finally` 保证沙箱/容器/登记回收；错误上抛并进 monitor。宿主销毁时 Cordis 级联 dispose 全部子 fiber。
