# Cordis 安全方案

## 一、问题分析

### 1.1 微前端安全威胁模型

| 威胁类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| **XSS 攻击** | 子应用注入恶意脚本，窃取其他应用数据 | 高 |
| **CSRF 攻击** | 伪造请求，以用户身份执行操作 | 高 |
| **沙箱逃逸** | 恶意应用突破沙箱隔离，污染全局环境 | 高 |
| **资源劫持** | CDN 资源被篡改，注入恶意代码 | 高 |
| **数据泄露** | 应用间数据被未授权访问 | 高 |
| **供应链攻击** | 第三方依赖被注入恶意代码 | 中 |
| **权限提升** | 低权限应用获取高权限操作 | 中 |
| **跨应用攻击** | 应用 A 攻击应用 B 的 DOM 或状态 | 中 |

### 1.2 Cordis 安全设计原则

1. **最小权限原则**：应用只拥有完成功能所需的最小权限
2. **深度防御原则**：多层安全防护，单层失效不会导致系统崩溃
3. **零信任原则**：不信任任何应用，所有访问都需要验证
4. **可审计原则**：所有敏感操作都有日志记录

---

## 二、安全架构

```
┌─────────────────────────────────────────────────────────────┐
│  Application Security Layer（应用安全层）                     │
│  - 权限控制                                                  │
│  - 数据加密                                                  │
│  - 输入验证                                                  │
├─────────────────────────────────────────────────────────────┤
│  Communication Security Layer（通信安全层）                  │
│  - 消息验证                                                  │
│  - 通信加密                                                  │
│  - 防重放攻击                                                │
├─────────────────────────────────────────────────────────────┤
│  Sandbox Security Layer（沙箱安全层）                         │
│  - 沙箱逃逸检测                                              │
│  - 全局变量保护                                              │
│  - 原型链保护                                                │
├─────────────────────────────────────────────────────────────┤
│  Resource Security Layer（资源安全层）                        │
│  - CSP 策略                                                  │
│  - SRI 完整性校验                                            │
│  - 资源白名单                                                 │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure Security Layer（基础设施安全层）              │
│  - HTTPS                                                     │
│  - 证书校验                                                  │
│  - 域名白名单                                                 │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 分级信任模型

在处理不同来源的微应用时，Cordis 引入了分级信任模型。需要明确的是，**Proxy 沙箱主要是为了隔离正确性（防止意外的全局变量污染），而不是严格的安全边界**。只有 iframe 沙箱才能提供真正的安全边界。

```typescript
// 应用信任级别
type TrustLevel = 'first-party' | 'third-party' | 'untrusted';

interface SecurityProfile {
  trustLevel: TrustLevel;
  sandbox: 'proxy' | 'iframe' | 'iframe-strict';
  permissions: 'full' | 'restricted' | 'minimal';
  networkAccess: 'unrestricted' | 'whitelist-only' | 'blocked';
  domAccess: 'full' | 'scoped' | 'virtual';
}
```

针对不同的信任级别，系统采取不同的安全策略：
- **First-party (第一方应用)**：使用 Proxy 沙箱 + 完整权限（信任但验证）。
- **Third-party (第三方应用)**：使用 iframe 沙箱 + 受限权限（全面验证）。
- **Untrusted (不可信应用)**：使用严格的 iframe 沙箱 + 最小权限。

---

## 三、XSS 防护

### 3.1 XSS 攻击场景

```javascript
// 场景1：子应用注入恶意脚本
const maliciousCode = '<script>stealData()</script>'
document.getElementById('content').innerHTML = maliciousCode

// 场景2：跨应用 XSS
// 应用 A 被攻击，攻击者通过应用 A 访问应用 B 的数据
window.__CORDIS_RUNTIME__.stateManager.set('user', stolenUserData)

// 场景3：DOM 注入
const payload = '"><script>alert("XSS")</script>'
document.querySelector(`[data-id="${payload}"]`)
```

### 3.2 防护措施

#### 3.2.1 输入消毒（Input Sanitization）

```typescript
// @cordis/security/sanitizer
class InputSanitizer {
  private static dangerousTags = [
    'script', 'iframe', 'object', 'embed', 'base',
    'form', 'input', 'button', 'select', 'textarea'
  ]
  
  private static dangerousAttributes = [
    'onload', 'onerror', 'onclick', 'onmouseover',
    'onfocus', 'onblur', 'onchange', 'onsubmit',
    'javascript:', 'vbscript:', 'data:text/html'
  ]
  
  // 清理 HTML 内容
  static sanitizeHTML(html: string): string {
    const div = document.createElement('div')
    div.textContent = html
    return div.innerHTML
  }
  
  // 清理 URL
  static sanitizeURL(url: string): string {
    const trimmed = url.trim().toLowerCase()
    
    // 只允许 http/https/相对路径
    if (trimmed.startsWith('http://') || 
        trimmed.startsWith('https://') || 
        trimmed.startsWith('/') ||
        trimmed.startsWith('./') ||
        trimmed.startsWith('../')) {
      return url
    }
    
    // 阻止 javascript:、vbscript: 等
    if (this.dangerousAttributes.some(attr => trimmed.startsWith(attr))) {
      return ''
    }
    
    return url
  }
  
  // 清理 JavaScript 代码
  // 警告：使用正则表达式进行 JS 消毒非常脆弱，容易被绕过（如空格变体、模板字符串、window['eval']、间接 eval 等）。
  // 强烈推荐使用基于 AST 的清理方案，或在现代浏览器中使用 Trusted Types API。
  static sanitizeJS(code: string): string {
    // 移除危险的 API 调用
    const dangerousAPIs = [
      /eval\s*\(/g,
      /new\s+Function\s*\(/g,
      /document\.write\s*\(/g,
      /innerHTML\s*=/g,
      /outerHTML\s*=/g
    ]
    
    let sanitized = code
    dangerousAPIs.forEach(api => {
      sanitized = sanitized.replace(api, '/* BLOCKED */')
    })
    
    return sanitized
  }
  
  // 验证 JSON 数据
  static sanitizeJSON(data: any): any {
    if (typeof data === 'string') {
      return this.sanitizeHTML(data)
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeJSON(item))
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {}
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          sanitized[key] = this.sanitizeJSON(data[key])
        }
      }
      return sanitized
    }
    
    return data
  }
}
```

#### 3.2.2 内容安全策略（CSP）

```typescript
// @cordis/security/csp
class CSPManager {
  private policies: Map<string, string[]> = new Map()
  
  // 设置 CSP 策略
  setPolicy(appId: string, policy: CSPPolicy): void {
    const directives: string[] = []
    
    if (policy.defaultSrc) {
      directives.push(`default-src ${policy.defaultSrc.join(' ')}`)
    }
    if (policy.scriptSrc) {
      directives.push(`script-src ${policy.scriptSrc.join(' ')}`)
    }
    if (policy.styleSrc) {
      directives.push(`style-src ${policy.styleSrc.join(' ')}`)
    }
    if (policy.imgSrc) {
      directives.push(`img-src ${policy.imgSrc.join(' ')}`)
    }
    if (policy.connectSrc) {
      directives.push(`connect-src ${policy.connectSrc.join(' ')}`)
    }
    if (policy.frameSrc) {
      directives.push(`frame-src ${policy.frameSrc.join(' ')}`)
    }
    
    this.policies.set(appId, directives)
    this.applyCSP(appId)
  }
  
  // 应用 CSP 策略
  private applyCSP(appId: string): void {
    const directives = this.policies.get(appId)
    if (!directives) return
    
    // 警告：通过 <meta> 标签设置 CSP 存在局限性，会忽略 frame-ancestors、report-uri、sandbox 等指令。
    // 生产环境中强烈建议使用 HTTP 响应头（Content-Security-Policy）来配置 CSP。
    const meta = document.createElement('meta')
    meta.setAttribute('http-equiv', 'Content-Security-Policy')
    meta.setAttribute('data-cordis-app', appId)
    meta.setAttribute('content', directives.join('; '))
    document.head.appendChild(meta)
  }
  
  // 默认安全策略
  static getDefaultPolicy(): CSPPolicy {
    return {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // 开发环境需要
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}

interface CSPPolicy {
  defaultSrc?: string[]
  scriptSrc?: string[]
  styleSrc?: string[]
  imgSrc?: string[]
  connectSrc?: string[]
  frameSrc?: string[]
  objectSrc?: string[]
  baseUri?: string[]
  formAction?: string[]
}
```

#### 3.2.3 安全的 DOM 操作

```typescript
// @cordis/security/dom
class SafeDOM {
  // 安全地设置 innerHTML
  // 注：在现代浏览器中，推荐结合使用 Trusted Types API 来强制防御基于 DOM 的 XSS 攻击。
  static setInnerHTML(element: Element, html: string): void {
    // 使用 DOMPurify 或自定义清理器
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['div', 'span', 'p', 'a', 'img', 'ul', 'li', 'br'],
      ALLOWED_ATTR: ['class', 'id', 'href', 'src', 'alt', 'title']
    })
    element.innerHTML = sanitized
  }
  
  // 安全地创建元素
  static createElement(tag: string, attributes: Record<string, string> = {}): HTMLElement {
    const element = document.createElement(tag)
    
    for (const [key, value] of Object.entries(attributes)) {
      // 验证属性值
      if (this.isSafeAttribute(key, value)) {
        element.setAttribute(key, value)
      }
    }
    
    return element
  }
  
  // 验证属性安全性
  private static isSafeAttribute(name: string, value: string): boolean {
    // 阻止事件属性
    if (name.startsWith('on')) {
      return false
    }
    
    // 阻止 javascript: 协议
    if ((name === 'href' || name === 'src') && 
        value.toLowerCase().trim().startsWith('javascript:')) {
      return false
    }
    
    return true
  }
  
  // 安全地插入脚本
  static injectScript(src: string, options: { async?: boolean, defer?: boolean } = {}): HTMLScriptElement {
    const script = document.createElement('script')
    script.src = InputSanitizer.sanitizeURL(src)
    if (options.async) script.async = true
    if (options.defer) script.defer = true
    document.head.appendChild(script)
    return script
  }
}
```

---

## 四、沙箱逃逸防护

### 4.1 常见沙箱逃逸手段

```javascript
// 手段1：通过原型链访问全局对象
const globalThis = (() => this.constructor.constructor('return this')())()

// 手段2：通过 iframe 访问真实 window
const iframe = document.createElement('iframe')
document.body.appendChild(iframe)
const realWindow = iframe.contentWindow

// 手段3：通过 Error 对象获取堆栈
try {
  throw new Error()
} catch (e) {
  const caller = e.stack.split('\n')[2]
}

// 手段4：通过 Symbol 访问内部对象
const internal = Object.getOwnPropertyNames(Symbol)

// 手段5：通过 Proxy 逃逸
const proxy = new Proxy({}, {
  get() {
    return arguments.callee.constructor('return global')()
  }
})
```

### 4.2 防护措施

#### 4.2.1 原型链保护

```typescript
// @cordis/security/prototype-guard
class PrototypeGuard {
  private static protectedPrototypes = [
    Object.prototype,
    Array.prototype,
    String.prototype,
    Number.prototype,
    Boolean.prototype,
    Function.prototype,
    Date.prototype,
    RegExp.prototype,
    Error.prototype,
    Promise.prototype
  ]
  
  private static originalDescriptors: Map<string, PropertyDescriptor> = new Map()
  
  // 冻结关键原型
  // 警告：严格冻结原型链会破坏许多 polyfill 和第三方库。
  // 建议在生产环境中默认使用 monitorPrototypeChanges（仅监控模式）代替严格冻结。
  static freezePrototypes(): void {
    this.protectedPrototypes.forEach(proto => {
      const keys = Object.getOwnPropertyNames(proto)
      
      keys.forEach(key => {
        const descriptor = Object.getOwnPropertyDescriptor(proto, key)
        if (descriptor && descriptor.configurable) {
          // 保存原始描述符
          this.originalDescriptors.set(`${proto.constructor.name}.${key}`, descriptor)
          
          // 重新定义为不可配置
          Object.defineProperty(proto, key, {
            ...descriptor,
            configurable: false,
            writable: false
          })
        }
      })
      
      // 阻止原型被扩展
      Object.preventExtensions(proto)
    })
  }
  
  // 检测原型链是否被篡改
  static verifyPrototypes(): boolean {
    for (const proto of this.protectedPrototypes) {
      const keys = Object.getOwnPropertyNames(proto)
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, key)
        const original = this.originalDescriptors.get(`${proto.constructor.name}.${key}`)
        
        if (original && descriptor && (
          descriptor.value !== original.value ||
          descriptor.get !== original.get ||
          descriptor.set !== original.set
        )) {
          console.error(`[Cordis Security] Prototype pollution detected: ${proto.constructor.name}.${key}`)
          return false
        }
      }
    }
    return true
  }
  
  // 监控原型链修改
  static monitorPrototypeChanges(): void {
    this.protectedPrototypes.forEach(proto => {
      const proxy = new Proxy(proto, {
        defineProperty(target, key, descriptor) {
          console.warn(`[Cordis Security] Prototype modification blocked: ${target.constructor.name}.${key}`)
          return false
        },
        set(target, key, value) {
          console.warn(`[Cordis Security] Prototype modification blocked: ${target.constructor.name}.${key}`)
          return true  // 返回 true 避免报错，但不实际设置
        }
      })
      
      // 替换原型（需要小心使用）
      // Object.setPrototypeOf(proto, proxy)
    })
  }
}
```

#### 4.2.2 增强的 Proxy 沙箱

```typescript
// @cordis/security/enhanced-sandbox
class EnhancedProxySandbox {
  private fakeWindow: Record<string, any> = {}
  private proxy: WindowProxy
  private blockedKeys: Set<string> = new Set()
  
  // 需要阻止访问的键
  private static dangerousKeys = [
    'eval', 'Function', 'constructor', '__proto__',
    'prototype', 'arguments', 'caller', 'callee'
  ]
  
  constructor(private appId: string) {
    this.proxy = new Proxy(this.fakeWindow, {
      get: (target, key) => {
        // 阻止访问危险键
        if (EnhancedProxySandbox.dangerousKeys.includes(key as string)) {
          this.logSecurityEvent('blocked_access', key as string)
          return undefined
        }
        
        // 特殊处理
        if (key === 'window' || key === 'self' || key === 'globalThis') {
          return this.proxy
        }
        
        if (key === 'top' || key === 'parent') {
          return this.proxy  // 阻止访问真实顶层窗口
        }
        
        // 只读属性
        if (this.isReadonly(key)) {
          return (window as any)[key]
        }
        
        // 从 fakeWindow 获取
        if (key in target) {
          return target[key]
        }
        
        // 透传
        return (window as any)[key]
      },
      
      set: (target, key, value) => {
        // 阻止修改危险键
        if (EnhancedProxySandbox.dangerousKeys.includes(key as string)) {
          this.logSecurityEvent('blocked_set', key as string)
          return true
        }
        
        target[key as string] = value
        return true
      },
      
      has: (target, key) => {
        return key in target || key in window
      },
      
      getOwnPropertyDescriptor: (target, key) => {
        // 阻止访问构造函数
        if (key === 'constructor') {
          return undefined
        }
        
        if (key in target) {
          return Object.getOwnPropertyDescriptor(target, key)
        }
        
        const descriptor = Object.getOwnPropertyDescriptor(window, key)
        if (descriptor) {
          // 返回只读副本
          return {
            ...descriptor,
            configurable: false,
            writable: false
          }
        }
        
        return undefined
      }
    })
  }
  
  // 检测沙箱逃逸尝试
  private logSecurityEvent(type: string, key: string): void {
    const event: SecurityEvent = {
      type,
      appId: this.appId,
      key,
      timestamp: Date.now(),
      stack: new Error().stack
    }
    
    securityLogger.log(event)
    
    // 严重事件触发告警
    if (type === 'blocked_access' && key === 'constructor') {
      securityAlert.trigger('SANDBOX_ESCAPE_ATTEMPT', event)
    }
  }
  
  private isReadonly(key: PropertyKey): boolean {
    const readonlyKeys = [
      'location', 'history', 'document', 'navigator',
      'console', 'performance'
    ]
    return readonlyKeys.includes(key as string)
  }
}
```

#### 4.2.3 iframe 沙箱隔离

```typescript
// @cordis/security/iframe-sandbox
class IframeSecuritySandbox {
  private iframe: HTMLIFrameElement
  private iframeWindow: Window
  
  // 使用 sandbox 属性限制 iframe 能力
  constructor(private appId: string) {
    this.iframe = document.createElement('iframe')
    this.iframe.setAttribute('sandbox', 
      'allow-scripts allow-same-origin allow-forms'
    )
    this.iframe.style.display = 'none'
    this.iframe.setAttribute('data-cordis-sandbox', appId)
    
    document.body.appendChild(this.iframe)
    this.iframeWindow = this.iframe.contentWindow!
  }
  
  // 在 iframe 中安全执行代码
  exec(code: string): void {
    const script = this.iframeWindow.document.createElement('script')
    script.textContent = code
    this.iframeWindow.document.body.appendChild(script)
    script.remove()
  }
  
  // 销毁沙箱
  destroy(): void {
    this.iframe.remove()
  }
}
```

---

## 五、资源加载安全

### 5.1 子资源完整性（SRI）

```typescript
// @cordis/security/sri
class SRIChecker {
  // 生成 SRI 哈希
  static async generateSRI(content: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-384', content)
    const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    return `sha384-${hashBase64}`
  }
  
  // 验证资源完整性
  static async verifyIntegrity(
    url: string, 
    expectedSRI: string
  ): Promise<boolean> {
    try {
      const response = await fetch(url)
      const content = await response.arrayBuffer()
      const actualSRI = await this.generateSRI(content)
      
      if (actualSRI !== expectedSRI) {
        securityLogger.log({
          type: 'SRI_MISMATCH',
          url,
          expected: expectedSRI,
          actual: actualSRI,
          timestamp: Date.now()
        })
        return false
      }
      
      return true
    } catch (error) {
      securityLogger.log({
        type: 'SRI_FETCH_ERROR',
        url,
        error: error.message,
        timestamp: Date.now()
      })
      return false
    }
  }
  
  // 安全加载脚本
  static async loadScript(
    url: string, 
    sri: string, 
    options: { async?: boolean, defer?: boolean } = {}
  ): Promise<HTMLScriptElement> {
    // 修复 SRI double-fetch TOCTOU 漏洞：直接依赖 script 标签的 integrity 属性，由浏览器发起单次获取和校验。
    const script = document.createElement('script')
    script.src = url
    script.integrity = sri
    script.crossOrigin = 'anonymous'
    if (options.async) script.async = true
    if (options.defer) script.defer = true
    
    document.head.appendChild(script)
    return script
  }
}
```

### 5.2 资源白名单

```typescript
// @cordis/security/resource-whitelist
class ResourceWhitelist {
  private allowedDomains: Map<string, string[]> = new Map()
  
  // 设置应用允许的域名
  setAllowedDomains(appId: string, domains: string[]): void {
    this.allowedDomains.set(appId, domains)
  }
  
  // 验证 URL 是否允许
  isAllowed(appId: string, url: string): boolean {
    const domains = this.allowedDomains.get(appId)
    if (!domains) return false
    
    try {
      const parsed = new URL(url, window.location.href)
      return domains.some(domain => {
        // 支持通配符
        if (domain.startsWith('*.')) {
          const suffix = domain.slice(2)
          return parsed.hostname === suffix || 
                 parsed.hostname.endsWith('.' + suffix)
        }
        return parsed.hostname === domain
      })
    } catch {
      return false
    }
  }
  
  // 验证资源加载
  verifyResource(appId: string, url: string): boolean {
    if (!this.isAllowed(appId, url)) {
      securityLogger.log({
        type: 'RESOURCE_BLOCKED',
        appId,
        url,
        timestamp: Date.now()
      })
      return false
    }
    return true
  }
}
```

### 5.3 动态脚本加载保护

```typescript
// @cordis/security/script-loader
class SecureScriptLoader {
  private whitelist: ResourceWhitelist
  private sriChecker: SRIChecker
  private loadedScripts: Map<string, boolean> = new Map()
  
  constructor(whitelist: ResourceWhitelist, sriChecker: SRIChecker) {
    this.whitelist = whitelist
    this.sriChecker = sriChecker
    
    // 拦截动态脚本创建
    this.interceptScriptCreation()
  }
  
  // 拦截 document.createElement('script')
  private interceptScriptCreation(): void {
    const originalCreateElement = document.createElement.bind(document)
    
    document.createElement = function(tagName: string): HTMLElement {
      const element = originalCreateElement(tagName)
      
      if (tagName.toLowerCase() === 'script') {
        const originalSetAttribute = element.setAttribute.bind(element)
        
        // 拦截 src 设置
        element.setAttribute = function(name: string, value: string) {
          if (name === 'src') {
            const appId = getCurrentAppId()
            if (!whitelist.verifyResource(appId, value)) {
              console.error(`[Cordis Security] Script loading blocked: ${value}`)
              return
            }
          }
          return originalSetAttribute(name, value)
        }
      }
      
      return element
    }
  }
  
  // 安全加载脚本
  async load(
    appId: string,
    url: string, 
    sri?: string,
    options: { async?: boolean, defer?: boolean } = {}
  ): Promise<void> {
    // 检查是否已加载
    if (this.loadedScripts.has(url)) {
      return
    }
    
    // 验证白名单
    if (!this.whitelist.verifyResource(appId, url)) {
      throw new Error(`Resource not allowed: ${url}`)
    }
    
    // 加载脚本（由浏览器原生支持 SRI 校验，避免 TOCTOU 问题）
    const script = document.createElement('script')
    script.src = url
    if (sri) script.integrity = sri
    script.crossOrigin = 'anonymous'
    if (options.async) script.async = true
    if (options.defer) script.defer = true
    
    document.head.appendChild(script)
    this.loadedScripts.set(url, true)
  }
}
```

---

## 六、应用间权限控制

### 6.1 权限模型

```typescript
// @cordis/security/permissions
interface AppPermission {
  appId: string
  permissions: Permission[]
}

interface Permission {
  resource: string        // 资源名称（如 'state:user', 'message:cart:*'）
  action: 'read' | 'write' | 'execute'  // 操作类型
  effect: 'allow' | 'deny'  // 允许或拒绝
}

class PermissionManager {
  private permissions: Map<string, Permission[]> = new Map()
  
  // 设置应用权限
  setPermissions(appId: string, permissions: Permission[]): void {
    this.permissions.set(appId, permissions)
  }
  
  // 检查权限
  checkPermission(
    appId: string, 
    resource: string, 
    action: 'read' | 'write' | 'execute'
  ): boolean {
    const permissions = this.permissions.get(appId)
    if (!permissions) return false
    
    // 查找匹配的权限规则
    const matched = permissions.filter(p => 
      this.matchResource(p.resource, resource) && p.action === action
    )
    
    // 默认拒绝，有 allow 则允许
    if (matched.length === 0) return false
    
    // 如果有 deny 规则，优先拒绝
    if (matched.some(p => p.effect === 'deny')) {
      return false
    }
    
    return matched.some(p => p.effect === 'allow')
  }
  
  // 资源匹配（支持通配符）
  private matchResource(pattern: string, resource: string): boolean {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$')
    return regex.test(resource)
  }
}
```

### 6.2 权限配置

```json
// cordis.permissions.json
{
  "permissions": [
    {
      "resource": "state:user",
      "action": "read",
      "effect": "allow"
    },
    {
      "resource": "state:cart.*",
      "action": "write",
      "effect": "allow"
    },
    {
      "resource": "state:admin.*",
      "action": "*",
      "effect": "deny"
    },
    {
      "resource": "message:cart:*",
      "action": "execute",
      "effect": "allow"
    },
    {
      "resource": "message:user:*",
      "action": "execute",
      "effect": "allow"
    },
    {
      "resource": "dom:*",
      "action": "write",
      "effect": "deny"
    }
  ]
}
```

### 6.3 权限检查中间件

```typescript
// @cordis/security/permission-middleware
class PermissionMiddleware {
  private permissionManager: PermissionManager
  
  constructor(permissionManager: PermissionManager) {
    this.permissionManager = permissionManager
  }
  
  // 状态访问中间件
  stateAccessMiddleware = (context: {
    appId: string
    key: string
    action: 'read' | 'write'
  }): boolean => {
    return this.permissionManager.checkPermission(
      context.appId,
      `state:${context.key}`,
      context.action
    )
  }
  
  // 通信中间件
  communicationMiddleware = (message: CordisMessage): boolean => {
    return this.permissionManager.checkPermission(
      message.source,
      `message:${message.type}`,
      'execute'
    )
  }
  
  // DOM 访问中间件
  domAccessMiddleware = (context: {
    appId: string
    selector: string
    action: 'read' | 'write'
  }): boolean => {
    return this.permissionManager.checkPermission(
      context.appId,
      `dom:${context.selector}`,
      context.action
    )
  }
}
```

---

## 七、敏感数据保护

### 7.1 数据加密

```typescript
// @cordis/security/crypto
class DataEncryptor {
  private static algorithm = 'AES-GCM'
  private static keyLength = 256
  
  // 生成加密密钥
  static async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      { name: this.algorithm, length: this.keyLength },
      true,
      ['encrypt', 'decrypt']
    )
  }
  
  // 加密数据
  static async encrypt(data: string, key: CryptoKey): Promise<string> {
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    
    // 生成 IV
    const iv = crypto.getRandomValues(new Uint8Array(12))
    
    // 加密
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: this.algorithm, iv },
      key,
      dataBuffer
    )
    
    // 组合 IV 和加密数据
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encryptedBuffer), iv.length)
    
    return btoa(String.fromCharCode(...combined))
  }
  
  // 解密数据
  static async decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))
    
    // 提取 IV
    const iv = combined.slice(0, 12)
    const encryptedBuffer = combined.slice(12)
    
    // 解密
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: this.algorithm, iv },
      key,
      encryptedBuffer
    )
    
    const decoder = new TextDecoder()
    return decoder.decode(decryptedBuffer)
  }
  
  // 生成哈希
  static async hash(data: string): Promise<string> {
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
    return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
  }
}
```

### 7.2 敏感数据标记

```typescript
// @cordis/security/sensitive-data
class SensitiveDataManager {
  private sensitiveKeys: Set<string> = new Set([
    'password', 'token', 'secret', 'key', 'credential',
    'ssn', 'creditCard', 'bankAccount'
  ])
  
  // 标记敏感数据
  markSensitive(key: string): void {
    this.sensitiveKeys.add(key.toLowerCase())
  }
  
  // 检查是否为敏感数据
  isSensitive(key: string): boolean {
    return this.sensitiveKeys.has(key.toLowerCase())
  }
  
  // 脱敏处理
  mask(data: any): any {
    if (typeof data === 'string') {
      return data.replace(/./g, '*')
    }
    
    if (typeof data === 'number') {
      return 0
    }
    
    if (Array.isArray(data)) {
      return data.map(() => '***')
    }
    
    if (typeof data === 'object' && data !== null) {
      const masked: any = {}
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          masked[key] = this.isSensitive(key) ? '***' : this.mask(data[key])
        }
      }
      return masked
    }
    
    return data
  }
  
  // 日志脱敏
  sanitizeForLog(data: any): any {
    if (typeof data === 'object' && data !== null) {
      const sanitized: any = {}
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          if (this.isSensitive(key)) {
            sanitized[key] = '[REDACTED]'
          } else {
            sanitized[key] = this.sanitizeForLog(data[key])
          }
        }
      }
      return sanitized
    }
    return data
  }
}
```

---

## 八、安全审计日志

### 8.1 安全事件日志

```typescript
// @cordis/security/audit
class SecurityAuditLogger {
  private logs: SecurityEvent[] = []
  private maxLogs: number = 10000
  
  // 记录安全事件
  log(event: SecurityEvent): void {
    this.logs.push({
      ...event,
      timestamp: event.timestamp || Date.now(),
      stack: event.stack || new Error().stack
    })
    
    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
    
    // 实时上报
    this.reportToServer(event)
  }
  
  // 获取日志
  getLogs(filter?: SecurityEventFilter): SecurityEvent[] {
    if (!filter) return this.logs
    
    return this.logs.filter(log => {
      if (filter.type && log.type !== filter.type) return false
      if (filter.appId && log.appId !== filter.appId) return false
      if (filter.startTime && log.timestamp < filter.startTime) return false
      if (filter.endTime && log.timestamp > filter.endTime) return false
      return true
    })
  }
  
  // 上报到服务器
  private async reportToServer(event: SecurityEvent): Promise<void> {
    // 批量上报，避免频繁请求
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(event)], { type: 'application/json' })
      navigator.sendBeacon('/api/security/audit', blob)
    }
  }
  
  // 导出日志
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2)
  }
}

interface SecurityEvent {
  type: string
  appId?: string
  key?: string
  url?: string
  timestamp?: number
  stack?: string
  [key: string]: any
}

interface SecurityEventFilter {
  type?: string
  appId?: string
  startTime?: number
  endTime?: number
}
```

### 8.2 安全告警

```typescript
// @cordis/security/alert
class SecurityAlertManager {
  private alertRules: Map<string, AlertRule> = new Map()
  private alertCallbacks: Map<string, Set<(alert: SecurityAlert) => void>> = new Map()
  
  // 注册告警规则
  registerRule(name: string, rule: AlertRule): void {
    this.alertRules.set(name, rule)
  }
  
  // 触发告警
  trigger(alertType: string, event: SecurityEvent): void {
    const alert: SecurityAlert = {
      type: alertType,
      event,
      timestamp: Date.now(),
      severity: this.getSeverity(alertType)
    }
    
    // 通知订阅者
    const callbacks = this.alertCallbacks.get(alertType)
    if (callbacks) {
      callbacks.forEach(cb => cb(alert))
    }
    
    // 记录告警
    securityLogger.log({
      type: 'ALERT',
      alertType,
      event,
      timestamp: Date.now()
    })
    
    // 高严重度告警立即上报
    if (alert.severity === 'critical') {
      this.escalateAlert(alert)
    }
  }
  
  // 订阅告警
  onAlert(alertType: string, callback: (alert: SecurityAlert) => void): () => void {
    if (!this.alertCallbacks.has(alertType)) {
      this.alertCallbacks.set(alertType, new Set())
    }
    this.alertCallbacks.get(alertType)!.add(callback)
    
    return () => {
      this.alertCallbacks.get(alertType)?.delete(callback)
    }
  }
  
  // 获取严重度
  private getSeverity(alertType: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<string, string> = {
      'SANDBOX_ESCAPE_ATTEMPT': 'critical',
      'XSS_BLOCKED': 'high',
      'CSRF_BLOCKED': 'high',
      'RESOURCE_BLOCKED': 'medium',
      'SRI_MISMATCH': 'high',
      'PERMISSION_DENIED': 'low'
    }
    return (severityMap[alertType] || 'medium') as any
  }
  
  // 升级告警
  private async escalateAlert(alert: SecurityAlert): Promise<void> {
    // 发送紧急通知
    await fetch('/api/security/alerts/critical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert)
    })
  }
}

interface AlertRule {
  condition: (event: SecurityEvent) => boolean
  alertType: string
}

interface SecurityAlert {
  type: string
  event: SecurityEvent
  timestamp: number
  severity: 'low' | 'medium' | 'high' | 'critical'
}
```

---

## 九、CSRF 防护

### 9.1 CSRF Token

```typescript
// @cordis/security/csrf
class CSRFProtection {
  private token: string | null = null
  
  // 生成 CSRF Token
  generateToken(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    this.token = btoa(String.fromCharCode(...array))
    
    // 存储到 sessionStorage
    sessionStorage.setItem('cordis-csrf-token', this.token)
    
    return this.token
  }
  
  // 获取 Token
  getToken(): string {
    if (!this.token) {
      this.token = sessionStorage.getItem('cordis-csrf-token') || this.generateToken()
    }
    return this.token
  }
  
  // 验证 Token
  validateToken(token: string): boolean {
    return token === this.getToken()
  }
  
  // 拦截 fetch 请求
  interceptFetch(): void {
    const originalFetch = window.fetch
    
    window.fetch = async (input: RequestInfo, init?: RequestInit) => {
      // 只对同源请求添加 Token
      const url = typeof input === 'string' ? input : input.url
      if (this.isSameOrigin(url)) {
        const headers = new Headers(init?.headers)
        headers.set('X-CSRF-Token', this.getToken())
        
        init = {
          ...init,
          headers,
          credentials: 'same-origin'
        }
      }
      
      return originalFetch(input, init)
    }
  }
  
  // 拦截 XMLHttpRequest
  interceptXHR(): void {
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send
    const self = this
    
    XMLHttpRequest.prototype.open = function(
      method: string, 
      url: string, 
      ...args: any[]
    ) {
      this._cordis_url = url
      this._cordis_method = method
      return originalOpen.call(this, method, url, ...args)
    }
    
    XMLHttpRequest.prototype.send = function(body?: any) {
      if (self.isSameOrigin(this._cordis_url) && 
          ['POST', 'PUT', 'DELETE', 'PATCH'].includes(this._cordis_method)) {
        this.setRequestHeader('X-CSRF-Token', self.getToken())
      }
      return originalSend.call(this, body)
    }
  }
  
  // 检查同源
  private isSameOrigin(url: string): boolean {
    try {
      const parsed = new URL(url, window.location.href)
      return parsed.origin === window.location.origin
    } catch {
      return false
    }
  }
}
```

---

## 十、安全配置

### 10.1 配置文件

```json
// cordis.security.json
{
  "security": {
    "xss": {
      "enabled": true,
      "sanitizeHTML": true,
      "sanitizeURL": true,
      "csp": {
        "enabled": true,
        "policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
      }
    },
    "sandbox": {
      "type": "proxy",
      "strict": true,
      "blockDangerousKeys": true,
      "prototypeProtection": true
    },
    "resources": {
      "sri": true,
      "whitelist": [
        "self",
        "https://cdn.cordis.example.com",
        "https://cdn.jsdelivr.net"
      ]
    },
    "permissions": {
      "enabled": true,
      "default": "deny"
    },
    "csrf": {
      "enabled": true,
      "tokenHeader": "X-CSRF-Token"
    },
    "encryption": {
      "enabled": true,
      "algorithm": "AES-GCM"
    },
    "audit": {
      "enabled": true,
      "maxLogs": 10000,
      "reportEndpoint": "/api/security/audit"
    }
  }
}
```

---

## 十一、急停机制（Kill Switch）

在微前端架构中，如果某个微应用被攻破或出现严重故障，需要能够远程紧急禁用该应用，以防止影响全局或其他应用。

```typescript
// @cordis/security/kill-switch
interface EmergencyControl {
  disableApp(appId: string, reason: string): void;
  enableApp(appId: string): void;
  isAppDisabled(appId: string): boolean;
}

class RemoteAppControl implements EmergencyControl {
  private disabledApps: Map<string, string> = new Map();

  disableApp(appId: string, reason: string): void {
    this.disabledApps.set(appId, reason);
    // 强制卸载应用
    if (window.__CORDIS_RUNTIME__) {
      window.__CORDIS_RUNTIME__.unmountApp(appId);
    }
    securityLogger.log({
      type: 'EMERGENCY_STOP',
      appId,
      reason,
      timestamp: Date.now()
    });
  }

  enableApp(appId: string): void {
    this.disabledApps.delete(appId);
  }

  isAppDisabled(appId: string): boolean {
    return this.disabledApps.has(appId);
  }
}
```

---

## 十二、与现有方案对比

| 维度 | qiankun | wujia | micro-app | Cordis |
|------|---------|-------|-----------|--------|
| **XSS 防护** | 基础 | iframe 隔离 | 基础 | 全面 |
| **沙箱逃逸防护** | 基础 | 强（iframe） | 基础 | 全面 |
| **资源完整性** | 无 | 无 | 无 | SRI |
| **权限控制** | 无 | 无 | 无 | RBAC |
| **数据加密** | 无 | 无 | 无 | Web Crypto |
| **安全审计** | 无 | 无 | 无 | 完整 |
| **CSRF 防护** | 无 | 无 | 无 | 有 |
| **CSP 策略** | 无 | 无 | 无 | 有 |

---

## 十三、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | XSS 防护 | 输入消毒、CSP |
| P0 | 沙箱逃逸防护 | 原型链保护、增强 Proxy |
| P0 | 权限控制 | RBAC 模型 |
| P1 | 资源完整性 | SRI 校验 |
| P1 | CSRF 防护 | Token 机制 |
| P1 | 安全审计 | 事件日志 |
| P2 | 数据加密 | Web Crypto API |
| P2 | 安全告警 | 规则引擎 |
| P3 | 资源白名单 | 域名控制 |
| P3 | 敏感数据保护 | 脱敏处理 |
