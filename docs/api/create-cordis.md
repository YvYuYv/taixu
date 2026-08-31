# createCordis 配置

```typescript
import { createCordis } from '@taixu/core'

const host = createCordis(options)
```

## 全量配置

```typescript
interface CreateCordisOptions {
  // —— 应用与路由 ——
  apps?: AppDefinition[]                    // defineApp() 产物清单
  routes?: RouteRule[]                      // { basePath, appId } 路径段边界匹配
  outlets?: Record<string, string>          // 槽位 -> CSS 选择器（缺省 #{outlet}）
  router?: RouterConfig                     // lazyOutlets / widgetOutlets / initialUrl / ioFactory
  onResolve?: (intent: MountIntent) => void // 挂载意图回调（lifecycle -> router 单向接线）

  // —— 生命周期 ——
  keepAlive?: KeepAliveConfig               // maxCount(5) / ttlMs / memory 水位
  recovery?: RecoveryConfig                 // maxRetries(2) / backoffMs(1000) / fallbackAppId

  // —— 状态 ——
  state?: StateConfig                       // conflict(reject|lww|merge|custom) / timeTravel / sensitiveKeys

  // —— 通信 ——
  bus?: BusConfig                           // 挂起队列上限/回放批大小

  // —— 监控 ——
  monitor?: MonitorConfig                   // alertRules / errorRate / sourcemap / privacy / overhead / metricsBuffer / leak

  // —— 安全 ——
  security?: SecurityConfig                 // queryBlacklist / trustedTypes / violationThrottleMs / verifyKillCommand
  permissions?: PermissionRule[]            // { appId, allow } deny-by-default

  // —— 样式与主题 ——
  style?: StyleConfig                       // sheetFactory（测试/宿主注入）
  theme?: ThemeConfig                       // tokens / dark / light / followSystem

  // —— 共享依赖 ——
  deps?: DepsConfig                         // shared 清单 / retryBackoffMs

  // —— 沙箱 ——
  prototypeGuard?: { enabled?: boolean; targets?: readonly object[] }  // opt-in（实验性）
}
```

## 返回的 host（根 Context）

服务直接挂 ctx 属性：

| 属性 | 主要方法 |
|---|---|
| `host.lifecycle` | `mount` / `switch` / `destroy` / `getAppState` / `getInstances` / `reveal` |
| `host.router` | `navigate` / `watch` / `match` |
| `host.state` | `set` / `get` / `setIfMatch` / `watch` / `history` / `travelTo` |
| `host.bus` | `send` / `broadcast` / `request` / `onRequest` / `deadLetters` |
| `host.monitor` | `capture` / `count` / `metricsSnapshot` / `errors` / `trigger` / `leakSuspects` |
| `host.security` | `check` / `reportViolation` |
| `host.deps` | `registerShared` / `negotiate` / `sharedVersions` |
| `host.style` | `inject` / `fontRegistryEntries` / `observeRuntimeStyles` |
| `host.theme` | `setTheme` / `patchTheme` / `current` / `reset` |
| `host.devtools` | `snapshot` / `execute` / `scanStyleConflicts` |
| `host.sandbox` | `create` / `createIframeSandbox` |

事件订阅：`host.on('app/ready', fn, { global: true })`。
