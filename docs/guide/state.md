# 状态管理与时间旅行

## 三层键空间

```typescript
ctx.state.set('local:draft', obj)      // local:   应用私有（前缀即权限）
ctx.state.set('scoped:cart.items', x)  // scoped:  应用间可见（路由联动）
ctx.state.set('shared:cart.items', x)  // shared:  跨应用（需权限声明）
```

权限裁决 fail-closed：未声明 `state:write:shared:*` 的写入直接拒绝 + violation 上报。

## 深层代理（稳定身份）

嵌套对象经深层代理——子路径读取（`'shared:cfg.ui.theme'` 沿点分段下钻）与 Vue/React 适配的响应式追踪共用稳定对象身份。

## 乐观并发 CAS + 冲突消解

```typescript
const v = ctx.state.set('shared:cart.items', next, { appId: 'cart-app' })
// CAS：版本匹配走唯一提交管线；不匹配交由 ConflictResolver
createCordis({
  state: {
    conflict: 'lww',        // reject（默认，抛 VERSION_CONFLICT）/ lww / merge / custom
  },
})
```

四策略：**reject**（默认 = 既有行为）/ **last-write-wins** / **merge**（深层合并）/ **custom**（自定义函数）。非 reject 策略的消解值经同一 commit 管线提交（版本原子推进，通知/持久化语义一致）。

## watch（响应式）

```typescript
ctx.state.watch(ctx, 'shared:cart.items', (value) => { /* 响应变更 */ })
```

effect 托管：应用 dispose 自动取消订阅。

## 时间旅行（开发模式）

```typescript
createCordis({ state: { timeTravel: { enabled: true, capacity: 500 } } })

host.state.history()          // 只读历史：{ key, version, source, ts, value }[]
host.state.travelTo(version)  // 回滚该 version 的键值（经同一 commit 管线，回滚本身也入账）
```

- **默认禁用**（规范明示"仅开发模式"）；未启用时 `travelTo` 抛错而非静默 no-op
- 记录粒度 = 单键提交，**全量值快照**（非 diff，回滚 O(1)）
- 环形缓冲 500 条，溢出覆盖最旧；未启用 = 零记账开销

## 持久化与跨 tab

持久化带 schema 版本 + 敏感键排除（`sensitiveKeys` 默认 token/password/secret/pii 族——同时联动 monitor 的 PII 脱敏）；跨 tab 经 storage 事件 + 版本仲裁 + 回声过滤。
