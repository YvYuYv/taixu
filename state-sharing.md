# Cordis 状态共享（State Sharing）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)。
> 术语约定（基线 §1.4）：**effect** = 可逆副作用；**coeffect** = 对 context 的声明式输入依赖（依赖变更触发重跑）。状态消费是一种典型的 **reactive coeffect**：应用声明依赖哪些状态键，runtime 在依赖变化时重新通知。

## 一、问题分析

### 1.1 微前端中状态共享的挑战

| 问题类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| 应用间状态隔离 | 各应用独立的 Vuex/Redux，无法共享 | 高 |
| 状态同步延迟 | 状态更新后其他应用响应不及时 | 中 |
| 状态版本冲突 | 同一数据在不同应用中版本不一致 | 高 |
| 全局状态污染 | 全局状态被意外修改，难以追踪 | 高 |
| 跨框架状态共享 | Vue 响应式状态无法直接被 React 使用 | 高 |

### 1.2 Cordis 理论视角（修正旧版杜撰术语）

旧版声称"状态 = coeffect（协同效应）"属于术语误用。正确的 Cordis 映射：

| Cordis 概念 | 在状态模块中的体现 |
|-------------|-------------------|
| **reactive coeffect**（声明式依赖 + 变更通知） | 应用声明依赖的状态键；键变更时 `state/changed` 事件通知订阅回调 |
| **revertible effect**（可逆副作用） | `ctx.state.watch` 内部经 `ctx.on('state/changed')` 注册（on 内部经 fiber.effect），应用 dispose 时自动退订（ADR-0001） |
| **事件（通知族）** | `state/changed` 单一变更事件（含版本与来源）；挂起恢复经 `state/sync` 一次性拉取（ADR-0023） |

注意：`ctx.isolate('state')` **不用于**键空间隔离（ADR-0003--isolate 是服务实例遮蔽，会让 shared 层跨应用不可见）。

关键原则：

- **显式声明**：应用必须显式声明依赖与写权限（inject + 权限清单）
- **单一写入管线**：所有写入（含深层、版本化、跨 tab 接收、服务端同步）走同一条管线--权限校验、版本推进、变更事件**恰好一次**
- **汇合性**：无论从哪个应用/标签页修改，最终状态一致（版本仲裁）

## 二、整体架构

```
┌────────────────────────────────────────────────────────────┐
│                     应用层（fork ctx）                       │
│   ctx.state.get / set / watch / batch（权限受控）            │
└──────────────────────────┬─────────────────────────────────┘
                           │ inject: ['state']
┌──────────────────────────▼─────────────────────────────────┐
│              StateService（root，基线 §2.2 服务清单）        │
│                                                            │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 三层键空间 │  │ 唯一写入管线  │  │ 事件订阅(ctx.on 托管) │  │
│  │ Global   │  │ permission->  │  │ watch(key, fn)       │  │
│  │ Shared   │  │ version->     │  │  └ 键过滤+自动退订     │  │
│  │ Local    │  │ notify(once) │  │ 深层代理(稳定身份)     │  │
│  └──────────┘  └──────────────┘  └──────────────────────┘  │
│        │                │                    │              │
│  ┌─────▼────────────────▼────────────────────▼───────────┐ │
│  │ 持久化(localStorage)   跨tab(BroadcastChannel)  服务端  │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

与旧版架构的本质差异：旧版是"自研 Map + 手动 subscribers + 手动 notify"的 pub/sub；新版观察者的生命周期由 `ctx.on` 托管（Cordis 原生，dispose 自动退订，ADR-0001），写入是一条**不可绕过**的管线。

## 三、三层状态模型（真实落地，非 PPT）

| 层 | 键空间 | 可见性 | 实现机制 |
|----|--------|--------|----------|
| Global | `global:*` | 全部应用 | root 单例键空间 |
| Shared | `shared:*` | 声明了该键的应用 | 权限清单（读/写分别授权） |
| Local | `local:{appId}:{instanceId}:*` | 仅本实例子树 | **键前缀 + fiber 归属校验**（ADR-0003：`ctx.isolate('state')` 是服务级注入遮蔽，会让每个应用拿到独立 state 服务实例、破坏 shared 层跨应用可见性，禁止用于键空间） |

- **命名空间是键前缀**（不是三个平行 Map），`state/changed` 事件的 `key` 携带全限定键
- Local 层归属校验：state 服务记录每个键的写入者 fiber，`get/set/watch` 校验调用方 fiber 是否为键的归属者（或经 security 授权）--**不使用 isolate**（同上）
- 应用 dispose 时：Local 层键空间整体回收（state 服务按 fiber 归属批量删除）；Shared/Global 层的应用级订阅自动解绑（`ctx.on` 随 fiber dispose 自动退订，见 §4.3）
- 多实例同应用：Local 键天然按 instanceId 隔离
- **`local:` 键的使用条款**（ADR-0029/0034/0044）：值必须 JSON 可序列化（驱逐快照的前提）；**禁止存 token/密码/PII**（快照落 sessionStorage，同 tab 同源全部脚本可读）

## 四、核心实现

### 4.1 服务定义与权限接线（修复旧版权限三处断裂）

```typescript
class StateService extends Service {
  static [Context.provide] = 'state'
  static inject = ['security', 'monitor']

  private store = new Map<string, StoredValue>()   // StoredValue = { value, version, updatedAt, updatedBy }
  private watchers = new Map<string, Set<WatchRecord>>()

  /** 权限来自 security 服务（deny-by-default），本模块不自建权限表 */
  private assertWrite(appId: string, key: string) {
    // security.checkPermission 实现了 action:'*' 通配（security.md §五）
    if (!this.security.checkPermission(appId, key, 'write')) {
      this.ctx.emit('security/violation', { appId, rule: 'state-write', detail: { key } })
      throw new CordisStateError('PERMISSION_DENIED', key)
    }
  }

  get(key: string, appId?: string): unknown {
    // 读权限校验（旧版只校验写、读裸奔）
    if (appId && !this.security.checkPermission(appId, key, 'read')) {
      throw new CordisStateError('PERMISSION_DENIED', key)
    }
    const entry = this.store.get(key)
    return entry?.value
  }

  set(key: string, value: unknown, options: { appId?: string }): number {
    if (options.appId) this.assertWrite(options.appId, key)   // appId 必填于一切外部写入
    return this.commit(key, value, { source: options.appId ?? 'system' })
  }

  /** 唯一提交路径：版本推进 + 单次通知 + 历史 + 持久化钩子 */
  private commit(key: string, value: unknown, meta: CommitMeta): number {
    const old = this.store.get(key)
    const version = (old?.version ?? 0) + 1
    this.store.set(key, { value, version, updatedAt: Date.now(), updatedBy: meta.source })
    if (this.batchDepth === 0) {
      this.notifyOnce(key, value, old?.value, meta)          // batch 内由 flush 统一通知
    }
    this.history.push({ key, value, version, source: meta.source, ts: Date.now() })
    this.onCommit(key, meta)   // 持久化/跨 tab/服务端同步钩子（§七）
    return version
  }
}
```

修复要点：

1. **权限不再形同虚设**：旧版 `appPermissions` Map 无填充 API、省略 appId 即免检、`read` 声明从不校验--新版权限全部来自 security 服务（deny-by-default，宿主清单配置），且**读也校验**
2. **键模型对齐**：旧版实现是扁平根键（`set('cart',…)`）而示例授权 `write: ["cart.items"]`，点分模式永不匹配。新版权限匹配由 security 的 `matchResource` 统一处理（前缀/通配/点分路径一体，security.md §五）
3. **`VersionedStateManager` 绕过权限的洞已闭合**：版本化写入与普通写入走同一条 `commit`，无免检旁路

### 4.2 深层响应式代理（稳定身份 + 正确 receiver）

```typescript
class DeepProxyFactory {
  /** 代理缓存：同 (key, rootVersion) 下 get 返回同一代理实例 */
  private cache = new WeakMap<object, Map<string, unknown>>()

  create(key: string, target: object, rootVersion: number): unknown {
    let perRoot = this.cache.get(target)
    if (!perRoot) { perRoot = new Map(); this.cache.set(target, perRoot) }
    const cached = perRoot.get(key)
    if (cached && this.proxyVersion(cached) === rootVersion) return cached   // 身份稳定

    const proxy = new Proxy(target, {
      get: (obj, prop, receiver) => {
        const value = Reflect.get(obj, prop, receiver)    // receiver 正确传递（getter this 语义）
        if (this.isPlainObject(value) || Array.isArray(value)) {
          return this.create(`${key}.${String(prop)}`, value, rootVersion)  // 子代理同样缓存
        }
        return value
      },
      set: (obj, prop, next, receiver) => {
        const prev = Reflect.get(obj, prop, receiver)
        const changed = Reflect.set(obj, prop, next, receiver)
        if (changed && prev !== next) {
          // 深层写入同样经过唯一提交路径（权限+版本+通知），路径为全限定键
          this.state.commitDeep(key, `${key}.${String(prop)}`, next, prev)
        }
        return changed
      },
    })
    perRoot.set(key, proxy)
    return proxy
  }
}
```

修复要点（旧版 S1-3）：

- **身份稳定**：`state.get('user') === state.get('user')` 成立（版本内缓存），Vue/React 同引用优化、memo 不再失效；旧版每次 get 新建 Proxy 导致 `===` 永远 false
- **receiver 正确**：getter 内 `this` 语义正确（旧版 `Reflect.get(obj, prop)` 丢 receiver）
- **oldValue 真实**：深层 set 通知携带 `prev`（旧版恒 undefined）
- Map/Set/Date 等非 plain object **不做深层代理**（原样返回，变更走显式 `set()`）--避免旧版语义黑洞；需要细粒度的场景用 `watch('key.path')`

### 4.3 watch：事件订阅（ctx.on 自动退订，ADR-0001）

```typescript
class StateService extends Service {
  watch(ctx: Context, key: string, fn: WatchFn, options?: WatchOptions): void {
    // 订阅生命周期 = 插件生命周期（Cordis ctx.on 内部经 fiber.effect 注册，dispose 自动退订）
    // 不自建 watcher 注册表、不手写 effect 包裹--ADR-0001：手工登记是第二套生命周期真相源
    ctx.on('state/changed', (payload) => {
      if (!this.matchKey(key, payload.key)) return   // 键过滤（前缀/点分路径）
      fn(payload.value)
    })
    fn(this.get(key))   // 立即以当前值执行一次（对齐 Cordis effect 首跑语义）
  }

  /** 挂起恢复的一次性同步（ADR-0023）：state 通道走拉模型，不走 bus 队列 */
  private onSuspendResume(instanceId: string) { /* 见 §七 挂起语义 */ }
}

// 应用内使用（reactive coeffect 的直接体现）：
export default function apply(ctx: Context) {
  ctx.state.watch(ctx, 'shared:cart', (cart) => {
    ctx['my-ui'].render(cart)   // cart 变更 -> 回调；应用卸载 -> ctx.on 自动退订
  })
}
```

- **`state/changed` 事件派发**：`ctx.emit`（通知族，fire-and-forget，基线 §2.4.1）--state 服务在 root 单例派发、`global: true` 广播
- **挂起语义**（ADR-0023）：state 服务经 `ctx.on('app/suspend')` / `ctx.on('app/resume')`（root 注册、global 监听）感知挂起态，**不 inject lifecycle**（依赖方向，基线 §2.3）；挂起期间对挂起应用**不推送** `state/changed`；恢复时按该应用 watch 的键集合派发一次性 `state/sync {keys: Record<key, {value, version}>}`（拉模型--状态可重拉、消息不可重放）
- 框架适配器（useSharedState / useCordisState）内部调用 `watch(ctx, ...)`，组件卸载经 effect 归还（应用内组件级订阅仍由框架 hook 自身管理，但都以 ctx 为宿主）

### 4.4 batch：真原子性（draft 副本，异常零通知）

```typescript
async batch<T>(ctx: Context, appId: string, keys: string[], mutator: (draft: Draft) => T): Promise<T> {
  // 1. 只克隆涉及的根键（旧版全量 structuredClone O(全状态)）
  const drafts = new Map<string, unknown>()
  for (const key of keys) this.assertWrite(appId, key)     // 前置统一校验（含深层）
  for (const key of keys) drafts.set(key, cloneSafe(this.get(key)))

  // 2. 在副本上执行变更（异常时真状态与订阅者完全无感）
  let result: T
  try {
    result = mutator(new DraftFacade(drafts, (path, next, prev) => this.draftOps.push({ path, next, prev })))
  } catch (error) {
    this.draftOps = []   // 丢弃全部操作，零通知零历史污染
    throw error
  }

  // 3. 一次性提交：逐键走 commit（每键恰好一次通知），跨 tab 同步合并为一条消息
  await this.flush()
  return result
}
```

- 旧版"原子性"是假的：draft 代理的就是真实 rootState，mutator 每次都即时通知，异常回滚再触发一轮通知且污染 history。新版异常路径**零通知**
- `cloneSafe`：structuredClone + 失败降级（函数/ DOM 引用直接报错并指明键，而非运行时爆炸）

### 4.5 版本与冲突（与写入管线合一）

```typescript
/** 乐观并发：compare-and-set。版本不匹配抛冲突，交由 ConflictResolver */
setIfMatch(key: string, expected: number, value: unknown, appId: string): number {
  this.assertWrite(appId, key)
  const current = this.store.get(key)
  if (current?.version !== expected) {
    const resolution = this.conflictResolver.resolve(key, {
      local: { value, version: expected, source: appId },
      remote: { value: current?.value, version: current?.version, source: current?.updatedBy },
    })
    if (resolution.strategy === 'reject') throw new CordisStateError('VERSION_CONFLICT', key)
    return this.commit(key, resolution.value, { source: appId, merged: true })
  }
  return this.commit(key, value, { source: appId })
}
```

- 旧版 `setWithVersion` 先 set 后推进版本（通知期间读到新值+旧版本）--新版版本与值在 commit 内**原子推进**
- `ConflictResolver` 四策略（last-write-wins / merge / custom / reject）真正接入写入管线（旧版全文档零调用点）；`merge` 不再用 `new Set` 破坏数组顺序（按业务注册的 merge 函数，默认 concat+去重保序）

## 五、权限与安全（与 security.md 联动）

```jsonc
// 宿主 cordis.config.json（唯一权限来源，deny-by-default）
{
  "state": {
    "grants": {
      "app-cart": {
        "read":  ["shared:cart", "global:user.profile"],
        "write": ["shared:cart", "shared:cart.*"],     // 点分路径与通配一体匹配
        "local": ["local:app-cart:*"]                   // 自动授予自身 Local 空间
      }
    },
    "sensitiveKeys": ["global:user.token", "global:auth.*"],  // 永不持久化/跨tab/DevTools 明文
  }
}
```

- `read/write` 均 deny-by-default；`action: '*'` 通配由 security.checkPermission 显式实现（修复旧版永不生效规则）
- 敏感键策略：持久化排除、跨 tab 不同步、`state/changed` 事件载荷脱敏为 `"[redacted]"`、DevTools 面板掩码显示（与 security.md §六、monitoring.md §4.5 联动）

## 六、跨框架适配

```typescript
// Vue 3（reactive 桥）
export function useSharedState<T>(ctx: Context, key: string, appId: string) {
  const state = shallowRef<T>(ctx.state.get(key) as T)
  // 订阅托管给 ctx.effect：应用卸载自动清理
  ctx.state.watch(ctx, key, (v) => { state.value = v as T })
  const set = (v: T) => ctx.state.set(key, v, { appId })
  return { state, set }
}

// React（经 cordis-react 适配层，应用 ctx 由 Provider 注入）
export function useSharedState<T>(key: string): [T, (v: T) => void] {
  const { ctx, appId } = useCordis()          // 从 Context.Provider 获取（不是全局单例）
  const [value, setValue] = useState<T>(() => ctx.state.get(key) as T)
  useEffect(() => {
    const off = ctx.state.watchLocal(key, setValue)  // 组件级订阅（hook 内自管理）
    return off
  }, [ctx, key])
  const set = useCallback((v: T) => ctx.state.set(key, v, { appId }), [ctx, key, appId])
  return [value, set]
}
```

- 旧版 React 侧"setCart 与 ctx.on('state:changed') 双通道同步"（双写重复渲染）、"手动 emit 广播旧值闭包"全部废除--变更事件只由**写入管线**发出，框架 hook 只消费
- 适配器最小集：Vue3 / React / Vue2（defineProperty 兼容层）；Angular/Svelte 经通用 `watch` API 自行桥接（P2）

## 七、持久化 / 跨标签页 / 服务端同步

### 7.1 持久化

```typescript
class PersistenceLayer {
  /** 防抖批量写入；sensitiveKeys 排除；schema 版本化 */
  private flush = debounce(() => {
    const payload: Record<string, unknown> = {}
    for (const key of this.config.persistKeys) {
      if (this.isSensitive(key)) continue
      payload[key] = this.serialize(this.state.get(key))
    }
    localStorage.setItem('cordis-state:v' + SCHEMA_VERSION, JSON.stringify({
      schema: SCHEMA_VERSION, savedAt: Date.now(), data: payload,
    }))
  }, 500)

  restore(ctx: Context) {
    const raw = localStorage.getItem('cordis-state:v' + SCHEMA_VERSION)
    if (!raw) return
    const parsed = JSON.parse(raw)
    // 跨版本：migrations 链逐级升级旧 schema（字段增删/重命名），失败则丢弃并上报
    const data = this.migrate(parsed)
    for (const [key, value] of Object.entries(data)) {
      this.state.commitSilent(key, value)   // 静默恢复：不触发 state/changed（订阅者经 watch 首跑取值）
    }
  }
}
```

修复旧版：恢复用 `set()` 触发全量通知（应静默）；无 schema 版本；敏感键全量落盘；`autoSave` 返回的 unsubscribe 无人接管（新版防抖层自身经 ctx.effect 注册）。

### 7.2 跨标签页（修复"远端更新失明"）

```typescript
class CrossTabSync {
  constructor(private state: StateService) {
    // 广播通道不可用（旧浏览器/file://）自动降级为 storage 事件
    this.channel = 'BroadcastChannel' in globalThis
      ? new BroadcastChannel('cordis-state')
      : null
    this.ctx.effect(() => {
      this.channel?.addEventListener('message', this.onMessage)
      const off = this.state.onCommit('*', this.onLocalCommit)
      return () => {
        this.channel?.removeEventListener('message', this.onMessage)
        off()
      }
    })
  }

  private onMessage = (e: MessageEvent) => {
    const msg = e.data as StateSyncMessage   // {key, value, version, source: tabId, schema}
    if (msg.source === this.tabId) return                       // 回声过滤
    if (this.isSensitive(msg.key)) return                       // 敏感键不同步
    const current = this.state.raw(msg.key)
    if (current && current.version >= msg.version) return       // 版本仲裁：旧消息丢弃
    // 远端应用：绕过本地权限（源端已校验），但必须通知本地订阅者（修复旧版 setSilent 失明）
    this.state.applyRemote(msg.key, msg.value, msg.version, msg.source)
  }

  private onLocalCommit = (key: string, meta: CommitMeta) => {
    if (meta.origin === 'remote') return                        // 远端来的不再回播
    this.channel?.postMessage({ key, value: this.state.get(key), version: meta.version, source: this.tabId, schema: SCHEMA_VERSION })
  }
}
```

修复旧版四个洞：`setSilent` 导致本 tab UI 收不到远端变更；不滤回声；消息不带版本（协议字段与实现脱节）；`destroy` 只关 channel 不退订 `'*'`（effect 托管后自动）。

**iframe 子应用跨 origin 场景**：BroadcastChannel 不跨 origin，bus 服务提供 `bus.channel('state')` 透明通道（同进程直连 / 跨 origin 走 postMessage 桥，见 communication-protocol.md §八）。

### 7.3 服务端同步

- push/pull 复用版本管线：pull 以 `(key, localVersion)` 请求增量，服务端返回更高版本则 `applyRemote`
- fetch 经 `bus.network.fetch`（唯一网络链路，自动携带 traceparent）；带 AbortSignal；并发 pull 经单飞（in-flight 去重）
- 冲突走 §4.5 ConflictResolver（同一套策略，不分本地/远端）

## 八、DevTools 联动

- 时间旅行：history 环形缓冲（默认 500 条，含 version/source/ts），devtools 经 `monitor` 暴露的只读接口消费；`travelTo(version)` 仅在开发模式提供（生产禁用）
- 状态树面板：按三层键空间分组渲染；敏感键掩码；变更流与 `state/changed` 一一对应

## 九、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | StateService 唯一写入管线 + 权限接线 + 三层键空间 |
| P0 | watch（effect 托管）+ Vue3/React 适配 |
| P1 | 深层代理（稳定身份）+ batch 真原子性 + 版本冲突 |
| P1 | 持久化（schema 版本+敏感排除）+ 跨 tab（版本仲裁+回声过滤） |
| P2 | 服务端同步、时间旅行、Vue2/Angular/Svelte 适配 |

## 十、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| S1-1 "coeffect context" 杜撰术语 | §1.2 以论文语义重述（reactive coeffect） |
| S1-2 自研 pub/sub 无视 Cordis 响应式 | §4.3 watch 经 ctx.effect 托管 |
| S1-3 深层 Proxy 身份不稳定/receiver 错误 | §4.2 版本内缓存 + Reflect receiver |
| S1-4 手工 + ctx.effect 双重清理 | §4.3 唯一 effect 注册 |
| S2-1 权限无填充 API/免检旁路/读写模型错配 | §4.1 security 服务统一校验（读写都校验） |
| S2-2/S2-3 batch 伪原子/回滚伪通知 | §4.4 draft 副本 + commitSilent 恢复 |
| S2-4 跨 tab setSilent 失明/无版本/回声 | §7.2 applyRemote + 版本仲裁 |
| S2-5 广播旧值闭包/双通道 | §六 适配器只消费写入管线事件 |
| S2-6 版本化绕过权限/版本推进时序 | §4.5 CAS 走同一管线 |
| S2-7 持久化敏感暴露/恢复全量通知 | §7.1 schema 版本 + sensitiveKeys + 静默恢复 |
| S2-9 三层模型 PPT 化 | §三 isolate 键空间真实落地 |
| X-5/X-6 事件契约与总线立场不一 | 统一 `state/changed`（基线 §2.4）；"StateSyncBus" 废除 |
