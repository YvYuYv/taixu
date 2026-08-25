# Cordis 安全方案（Security）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)（§四 安全基线）。
> 本文所有安全组件均为 **Cordis Service**（经 `static [Context.provide]` 注册、副作用经 `ctx.effect` 托管）--旧版十余个全局单例的"框架外对象"模式全部废除。

## 一、威胁模型与原则

### 1.1 微前端安全威胁模型

| 威胁类型 | 具体表现 | 缓解章节 |
|----------|----------|----------|
| XSS 攻击 | 子应用注入恶意脚本、窃取其他应用数据 | §三 CSP、§六 数据隔离 |
| CSRF 攻击 | 伪造请求以用户身份执行操作 | §七 CSRF（服务端协议） |
| 沙箱逃逸 | 恶意应用突破沙箱污染全局 | §四 信任分级（iframe 边界） |
| 资源劫持 | CDN 资源被篡改注入恶意代码 | §五 SRI + 清单签名 |
| 数据泄露 | 应用间数据未授权访问 | §六 权限 + 敏感数据 |
| 供应链攻击 | 第三方依赖被注入恶意代码 | §八 |
| 权限提升 | 低权限应用获取高权限操作 | §五 PermissionManager |
| 跨应用攻击 | A 攻击 B 的 DOM/状态/消息 | §五 + bus/state 定向 |

### 1.2 设计原则（不变，但落地方式修正）

1. **最小权限**：deny-by-default，能力经 ctx 服务注入而非全局句柄
2. **深度防御**：CSP / 沙箱 / 权限 / 审计 四层独立失效不致崩溃
3. **零信任**：所有跨应用访问显式授权；消息校验不因"未注册类型"默认放行
4. **可审计**：安全事件经 monitor 上报（签名端点，防伪造）

## 二、安全架构（Service 化）

```typescript
class SecurityService extends Service {
  static [Context.provide] = 'security'
  static inject = []    // 零业务依赖，权限裁决最先可用（基线 §2.3，ADR-0054）；违规上报经 ctx.emit('security/violation')，由 monitor 旁听，不 inject monitor

  constructor(ctx: Context, config: SecurityConfig) {
    super(ctx)
    this.permissions = new PermissionManager(config.grants)        // §五
    this.sanitizer = new Sanitizer(config.sanitize)                // §三
    this.sri = new SRIVerifier(config.integrityManifest)           // §五
    this.gateway = new NetworkGateway(ctx, config.network)         // §六
    this.audit = new AuditLogger(ctx, config.audit)                // §九
    // killSwitch（§十）、敏感数据（§六）同样在此组装
  }

  /** 其他服务消费的唯一入口（基线 §2.2） */
  checkPermission(appId: string, resource: string, action: 'read' | 'write' | 'execute' | '*'): boolean {
    return this.permissions.check(appId, resource, action)
  }
}
```

消费方接线（修复旧版"权限中间件从未接线"）：

| 消费方 | 调用点 |
|--------|--------|
| bus | dispatch 前校验 `message:{type}` execute（communication-protocol.md §三） |
| state | get/set 前校验 read/write（state-sharing.md §4.1） |
| deps | 加载 URL 白名单 + SRI（heterogeneous-loading.md §七） |
| sandbox | 黑名单/Worker/SW 策略（js-sandbox.md §3.1） |
| router | 跨应用导航守卫（route-adaptation.md §4.3.4） |

## 三、CSP 与注入净化

### 3.1 CSP 由宿主 HTTP 头统一下发（客户端配置废除）

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{N}';
  style-src 'self' 'nonce-{N}';
  connect-src 'self' https://cdn.example.com;
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  require-trusted-types-for 'script'
```

- **默认策略不含 `unsafe-inline`**（旧版示例自带 unsafe-inline，使 CSP 对 XSS 几乎无防御价值）
- 框架动态注入的 `<script>/<style>` 一律携带宿主 nonce（SecureScriptLoader §6.2）；`strict-dynamic` 可选启用
- Trusted Types `require-trusted-types-for 'script'` 作为纵深（DOM XSS sink 拦截）；框架自身的 innerHTML 写点全部改为安全 API（§6.3）
- 旧版"11.1 客户端 csp.policy 配置"废除（与 §3.2.2 决策一致，消除自相矛盾）

### 3.2 URL 白名单（默认拒绝 + 协议相对 URL 修复）

```typescript
class Sanitizer {
  sanitizeURL(appId: string, url: string): string | null {
    let parsed: URL
    try { parsed = new URL(url, document.baseURI) } catch { return null }
    // 默认拒绝（旧版：不匹配任何清单即放行，data:/blob:/file: 全过）
    switch (parsed.protocol) {
      case 'https:': break
      case 'http:': if (!this.allowInsecure) return null; break
      default: return null          // data:/blob:/javascript:/file: 一律拒绝（图片 data: 可按策略白名单例外）
    }
    if (parsed.protocol.startsWith('http') && !this.isAllowedOrigin(appId, parsed.origin)) return null
    return parsed.href
  }
  // 旧版 startsWith('/') 放行 '//evil.com'（协议相对 URL）-> new URL 解析后 origin 校验自然覆盖
}
```

### 3.3 HTML 净化（真 sanitize）

- 使用 DOMPurify（或等价库）；`dangerousTags/dangerousAttributes` 配置真实传入
- 旧版 `div.textContent = html; return div.innerHTML` 只是实体转义、声明的不良标签表从未使用--废除

## 四、信任分级（叙事一致）

| 信任级 | 执行环境 | 能力 |
|--------|----------|------|
| first-party | Proxy 沙箱（js-sandbox.md §三） | 完整框架服务（按权限），允许 `new Function` 等动态执行（受宿主 CSP 约束） |
| third-party | iframe sandbox（js-sandbox.md §五，**无 allow-same-origin**） | 仅 bus 桥通信；无进程内对象共享 |
| untrusted | 同 third-party + 默认全 deny 权限 + 独立 origin | 仅渲染 + 显式授权消息 |

- **全文叙事一致**：Proxy 沙箱不是安全边界（旧版 §2.1 与 §4.2.2/§11.1 对比表自相矛盾--已统一）
- Enhanced Proxy 沙箱的 dangerousKeys 黑名单（`constructor/__proto__/...`）只是**纵深**而非边界（js-sandbox §3.1 已列向量与缓解）；first-party 默认**不**封锁 eval/Function（旧版无条件封锁破坏第一方正常库）

## 五、权限系统（唯一实现，`'*'` 通配真实生效）

```typescript
class PermissionManager {
  /** deny-by-default；规则含 allow/deny，deny 优先；action 支持 '*'（显式实现，修复旧版永不匹配） */
  check(appId: string, resource: string, action: PermissionAction): boolean {
    const rules = this.grants[appId] ?? []
    let allowed = false
    for (const rule of rules) {
      if (!this.matchResource(rule.resource, resource)) continue
      if (rule.action !== '*' && rule.action !== action) continue
      if (rule.effect === 'deny') return false            // deny 一票否决（顺序无关）
      if (rule.effect === 'allow') allowed = true
    }
    return allowed
  }

  /** 通配转义（`*`->`.*`，其余字符 escape；修复旧版两套通配语义不一致）
      编译产物缓存键挂权限表版本号：热更新 bump 版本自动失效（ADR-0039） */
  private compile(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${escaped}$`)
  }
  private matchResource(pattern: string, resource: string): boolean {
    if (pattern === 'self') return this.isSelfPattern(pattern, resource)   // 'self' -> 应用自身命名空间
    if (pattern === resource) return true
    return this.cache(pattern).test(resource)
  }
}
```

### 5.1 裁决的三个不变量（ADR-0024/0028/0039/0051）

1. **无跨调用缓存**（ADR-0039）：权限表在内存（Map），单次查询 O(规则数) 匹配、微秒级--不是瓶颈（真正瓶颈是网络 I/O）；只有规则**编译产物**（glob->RegExp）可缓存，缓存键挂权限表版本号，热更新 bump 自动失效。**TTL 缓存禁止**：窗口期内"管理员封禁某 API 后 30s 仍可用"是安全漏洞
2. **单点查询不走事件调度**（ADR-0028）：scopedFetch 等单裁决者场景直接 `await ctx.security.check()` 服务方法（并发请求并发裁决）；不进 serial 管线（顺序 await 会把高频并发请求串行化）。**超时 fail-closed**（ADR-0024）：默认 5s，超时视为裁决失败拒绝（`{ok:false, reason:'adjudication-timeout'}`）并 `monitor.capture` 上报（连续 N 次超时升级告警）
3. **规则必须本地可判定**（ADR-0051）：只允许应用身份、API 模式（glob）、时间窗口（本地时钟）、环境标记四类判定要素；远程策略（如"仅工作日"）由管理后台**预编译为本地规则**下发，不在裁决路径做远程调用--网络分区时所有 fetch 不能因裁决卡死

规则示例（含点分路径，state-sharing.md §五联用）：

```jsonc
{
  "grants": {
    "app-admin": [
      { "resource": "state:shared:admin.*", "action": "*", "effect": "deny" },   // '*'-deny 现在真实生效
      { "resource": "state:shared:cart",    "action": "write", "effect": "allow" },
      { "resource": "message:cart:*",       "action": "execute", "effect": "allow" },
      { "resource": "network:https://api.example.com/*", "action": "connect", "effect": "allow" }
    ]
  }
}
```

## 六、数据与网络隔离

### 6.1 敏感数据（token 等不进广播/存储/日志）

- 令牌分发：**受控注入通道**--宿主在应用挂载时按权限将 token 注入应用自己的存储命名空间（`__cordis__{appId}__token`），不经消息广播、不进全局 state 键、`state/changed` 载荷对 sensitiveKeys 脱敏
- DevTools/monitor 面板对 sensitiveKeys 掩码；审计日志脱敏器处理多行/循环引用（§九）

### 6.2 NetworkGateway（挂 bus 唯一链，不猴补 fetch）

```typescript
class NetworkGateway {
  /** 注册为 bus.network 的 interceptor（communication-protocol.md §六）：
      链序 tracing -> security(本类) -> monitor -> 原生 fetch。
      修复旧版：全局替换 window.fetch 无回滚、effect 恢复从未注入的对象、policies 永不清理。 */
  register(ctx: Context, appId: string) {
    const dispose = this.bus.network.intercept(appId, async (input, init, info, next) => {
      const url = typeof input === 'string' ? input : input.url
      if (!this.sanitizer.sanitizeURL(appId, url)) {
        this.ctx.emit('security/violation', { appId, rule: 'network-block', detail: { url } })
        throw new NetworkBlockedError(url)
      }
      return next(input, init)
    })
    // 生命周期：interceptor 跟随应用沙箱销毁（bus.network.intercept 返回的 disposer 挂应用 ctx.effect）
    ctx.effect(() => dispose)
  }
}
```

- 覆盖面：fetch/XHR/WebSocket/EventSource/sendBeacon 全部经 js-sandbox 的 scoped 包装（旧版只拦 fetch，`networkAccess: 'blocked'` 承诺无法兑现--修复）

### 6.3 动态脚本加载（nonce + 白名单 + SRI，修复 ReferenceError 与绕过）

```typescript
class SecureScriptLoader {
  constructor(private ctx: Context, private security: SecurityService, private nonce: string) {}

  init(ctx: Context) {
    ctx.effect(() => {
      const rawCreate = document.createElement.bind(document)
      const patch = (tag: string, options?: ElementCreationOptions) => {
        const el = rawCreate(tag, options)                 // options 第二参保留（旧版丢弃）
        if (tag.toLowerCase() === 'script' || tag.toLowerCase() === 'link') {
          const appId = this.security.currentAppId()       // 同步注册期归因
          const rawSetAttr = el.setAttribute.bind(el)
          el.setAttribute = (name: string, value: string) => {
            if (name === 'src' || name === 'href') {
              const sanitized = this.security.sanitizer.sanitizeURL(appId, value)   // 修复旧版裸引用 whitelist 的 ReferenceError
              if (!sanitized) throw new ResourceBlockedError(value)
              rawSetAttr(name, sanitized)
              rawSetAttr('integrity', this.security.sri.lookup(sanitized) ?? '')
              rawSetAttr('crossorigin', 'anonymous')
              if (this.nonce) rawSetAttr('nonce', this.nonce)
              return
            }
            if (name === 'nonce') return rawSetAttr(name, this.nonce)   // nonce 不可被应用覆写
            rawSetAttr(name, value)
          }
          // src 直接属性赋值路径（旧版绕过）：
          let pendingSrc: string | undefined
          Object.defineProperty(el, 'src', {
            get: () => pendingSrc ?? (el as HTMLScriptElement).src,
            set: (v) => { el.setAttribute('src', v) },     // 收敛到受控 setAttribute
          })
        }
        return el
      }
      document.createElement = patch
      return () => { document.createElement = rawCreate }   // effect 托管回滚（旧版无回滚）
    })
  }
}
```

## 七、CSRF（服务端协议，废除客户端自造 token）

- **协议**：服务端登录时下发 `SameSite=Lax/Strict` Cookie + CSRF token（`Set-Cookie: __Host-csrf`）；写请求携带 `X-CSRF-Token` 头（由 NetworkGateway 从受控存储读取附加），服务端 double-submit 校验
- 旧版客户端 `crypto.getRandomValues` 自生成 token 存 sessionStorage（无服务端校验，不构成防护）废除
- NetworkGateway 不再强制覆盖 `credentials`（保留应用自身设置，修复对合法跨域请求的破坏）

## 八、资源完整性与供应链

### 8.1 SRI（签名清单）

- 期望哈希来源：**构建期生成的 manifest 经 CI 签名**（宿主公钥验签后使用）--同 CDN 未签名 manifest 形同虚设的问题消除
- `loadScript` 监听 `onload/onerror`；SRI 失败 reject 且告警（旧版只 console.error，调用方无感知继续跑）
- 覆盖：入口 JS、CSS `<link>`、动态 import 分块（deps 服务统一经此校验）
- 哈希计算分块读取（废除 `String.fromCharCode(...bytes)` 大资源栈溢出）

### 8.2 供应链

- CI 锁文件审计（`npm audit`/osv-scanner）+ 依赖白名单变更 PR 评审
- 子应用依赖声明（cordis.dependencies.json）进 manifest 签名范围

## 九、审计与告警

```typescript
class AuditLogger {
  /** 批量+签名上报（修复旧版每条一次 sendBeacon 且端点无鉴权可被任意应用伪造） */
  private queue: AuditEvent[] = []
  private flush = debounce(() => {
    if (!this.queue.length) return
    const body = JSON.stringify({ schema: 1, events: this.queue.splice(0) })
    navigator.sendBeacon(this.endpoint, new Blob([body], { type: 'application/json' }))
    // 端点侧校验：会话 cookie + 事件 HMAC（上报密钥经受控注入，不暴露给应用）
  }, 1000)
  log(event: AuditEvent) { this.queue.push(this.redact(event)); this.flush() }

  private redact(event: AuditEvent): AuditEvent {
    // 脱敏：多行正则（修复旧版 /./g 不匹配换行）、循环引用安全序列化
  }
}
```

- 告警订阅：`ctx.on('monitor/alert', fn)`（Cordis 原生；旧版手写 callbacks 数组且无 serial 逐回调 await）
- 采样与限流：安全事件默认全量，网络违规类高频事件按 (appId, rule) 限流去重

## 十、Kill Switch（急停）

```typescript
class KillSwitch {
  private disabled: Set<string> = new Set()

  /** 指令经签名通道下发（monitor 告警通道复用），不是任意应用可调的全局函数 */
  async disableApp(appId: string, reason: string, signature: string) {
    if (!this.verifyCommand(appId, 'disable', signature)) {
      this.ctx.emit('security/violation', { appId: 'host', rule: 'killswitch-forged', detail: { reason } })
      return
    }
    this.disabled.add(appId)
    // 强制执行点：deps.loadApp 前检查 -> 抛 AppDisabledError；已运行实例 -> lifecycle.destroy
    await this.lifecycle?.destroyByAppId(appId, `killswitch: ${reason}`)
    this.persist()   // sessionStorage 持久化（刷新仍生效，管理员显式恢复）
  }
}
```

- 旧版 `window.__CORDIS_RUNTIME__.unmountApp` 全局句柄（任何沙箱应用可调用杀掉其他应用）废除--`__CORDIS_*` 全局列入沙箱黑名单（js-sandbox §六）
- 指令来源签名校验；`isAppDisabled` 在加载路径强制执行
- 落地形式：验签器经 `security.verifyKillCommand` 配置注入（宿主持有验签密钥/远端验签实现；未配置 = 一切指令拒绝，deny-by-default）；禁用清单持久化键 `__tx_disabled_apps`（sessionStorage，仅 appId 清单无敏感载荷）；运行实例销毁经 `security/killswitch` 事件由 lifecycle 旁听执行（security 不 inject lifecycle，ADR-0054）；`enableApp` 同样经签名通道（管理员显式恢复）

## 十一、postMessage 与跨源安全

- 全部 postMessage：显式 targetOrigin（禁 `'*`）；接收侧 `event.origin` 白名单 + `event.source` 校验（bus 的 IframeBridge 统一实现，communication-protocol.md §八）
- BroadcastChannel：仅同源框架内部使用（state 跨 tab），消息含 schema 版本与回声过滤
- `window.open` 弹窗：经权限（`window:open`）+ opener 关系断开（`noopener`）

## 十二、配置

```typescript
interface SecurityConfig {
  trustDefaults: Record<string, 'first-party' | 'third-party' | 'untrusted'>
  grants: Record<string, PermissionRule[]>
  sanitize: { allowInsecure?: boolean; allowDataImage?: boolean }
  network: { originAllowlist: Record<string, string[]> }    // 'self' 关键字由 matchResource 处理（修复旧版永不匹配）
  integrityManifest: { url: string; publicKey: string }
  audit: { endpoint: string; sampleRates?: Record<string, number> }
  killswitch: { enabled: boolean; commandKeyRef: string }
  iframe: { originAllowlist: string[] }
}
```

## 十三、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | SecurityService + PermissionManager（'*' 通配 + deny 优先）+ 消费方接线（bus/state/deps） |
| P0 | URL/HTML 净化（默认拒绝）+ CSP nonce 注入链 |
| P1 | SRI 签名清单 + NetworkGateway 挂 bus 链 + CSRF 服务端协议 |
| P1 | KillSwitch（签名指令）+ 审计批量签名上报 + 敏感数据通道 |
| P2 | Trusted Types 全量、iframe csp 属性、供应链 CI 集成 |

## 十四、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| 1.1 十余个全局单例非 Service | §二 全部 Service 化 + ctx.effect 托管 |
| 1.2 NetworkGateway 假 effect/全局替换 fetch | §6.2 挂 bus 唯一链、disposer 托管 |
| 1.3 createElement 猴补无回滚 | §6.3 effect 托管回滚 |
| 1.5 `__CORDIS_RUNTIME__` 攻击面 | §十 废除全局句柄 + 沙箱黑名单 |
| 2.1 sanitizeURL 默认放行/协议相对 URL 绕过 | §3.2 默认拒绝 + URL 解析 |
| 2.2 sanitizeHTML 名不副实 | §3.3 DOMPurify |
| 2.3 CSP unsafe-inline/与 3.2.2 矛盾 | §3.1 HTTP 头 + nonce + TT，客户端配置废除 |
| 2.4 Enhanced 沙箱 dangerousKeys 表面防护 | §四 降级为纵深；边界=iframe |
| 2.5 iframe allow-same-origin 反例 | §四/js-sandbox §五 移除 |
| 2.6 SRI 双重取数死代码/无 onload/大资源栈溢出/无信任链 | §8.1 签名清单+失败 reject+分块哈希 |
| 2.7 SecureScriptLoader ReferenceError/src 赋值绕过 | §6.3 this.security 引用 + src 属性收敛 |
| 2.8 action:'*' 永不生效 | §五 显式实现 + deny 优先 |
| 2.9 三个权限中间件未接线 | §二 接线表 |
| 2.10 客户端自造 CSRF token | §七 服务端 double-submit 协议 |
| 2.11 加密无密钥管理 | 移除客户端加密叙事（传输安全交 TLS；静态敏感数据走受控注入 §6.1） |
| 2.12 脱敏多行/循环引用 | §九 redact 修复 |
| 2.13 存储隔离停留在注释 | js-sandbox §3.7 真实现（本文引用） |
| 2.14 审计每条 sendBeacon/端点可伪造 | §九 批量+签名 |
| 2.15 PrototypeGuard 死实现 | js-sandbox §3.3 Object.freeze 策略 |
| 2.16 KillSwitch 无鉴权/内存态 | §十 签名指令+持久化+加载路径强制 |
| 11.1 白名单 'self' 永不匹配 | §五 matchResource 支持 self 关键字 |
