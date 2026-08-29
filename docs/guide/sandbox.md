# JS 沙箱与安全

## 双路线

| 路线 | 机制 | 适用 |
|---|---|---|
| Proxy 双窗口（默认） | fakeWindow（`Object.create(null)` 基座）+ 受控 document/localStorage 视图 | 可信级应用 |
| iframe 沙箱 | srcdoc + sandbox 属性 + postMessage 桥（handshake 超时 fail-closed） | 强隔离需求 |

## 沙箱能力

- **注入记账**：appendChild/insertBefore/innerHTML/insertAdjacentHTML 等写点全记账，style/script 注入可追踪（ADR-0033）
- **HTML sink 净化**：应用经沙箱 document 的 `innerHTML` 等写点全过 DOMPurify 净化；宿主启用 Trusted Types 时自动包装为 TrustedHTML（见下）
- **document.write 禁用**；`eval`/`Function` 走受控构造器（记账 + 告警，不转发原文——未记账的间接 eval 不存在）
- **原型守护（opt-in）**：

```typescript
createCordis({ prototypeGuard: { enabled: true } })
```

  冻结 11 个内建原型（Object/Array/Function/...），阻断「应用 monkey-patch 原型影响所有应用」。**默认关闭**（实测与 cordis 运行时自身不兼容，实验性——开启前请完成自有兼容性验证）。

- **customElements 冲突**：同名组件以 `appId-tag` 前缀注册并告警，应用侧看到自己的原始 tag
- **5 类逃逸向量直测**：`getPrototypeOf` 返回 null（关闭原型逃逸）、受控构造器、`__CORDIS_*` 黑名单全局封禁等

## 权限与裁决（fail-closed）

```typescript
createCordis({
  permissions: [{ appId: 'cart-app', allow: ['bus:send:pay-app', 'state:write:shared:cart'] }],
})
```

- 安全服务未就绪 = 全部应用无法挂载；裁决超时 = 拒绝；规则只本地可判定
- 违规上报 `security/violation`（网络类按 (appId, rule) 限流去重）

## URL 白名单

```typescript
createCordis({ security: { allowInsecure: false } })
```

默认拒绝（deny-by-default）：`https:` 放行；`http:` 需显式开 `allowInsecure`；`data:/blob:/javascript:/file:` 一律拒绝。

## Trusted Types 纵深

宿主 CSP 配置 `require-trusted-types-for 'script'` 后，框架净化结果自动经 policy 包装为 `TrustedHTML` 再落 sink（能力缺失自动降级为 string，行为不变）。策略名可配：

```typescript
createCordis({ security: { trustedTypes: { policyName: 'myapp#html' } } })
```

## KillSwitch（急停）

签名指令通道（deny-by-default：未配置验签器时一切急停指令拒绝）：

```typescript
createCordis({ security: { verifyKillCommand: (appId, action, sig) => verify(sig) } })
```

触发后按应用销毁全部实例，事件旁听驱动（不构成服务依赖）。
