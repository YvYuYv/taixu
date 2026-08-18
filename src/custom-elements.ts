/**
 * customElements per-app registry（js-sandbox §3.1 向量 #9）：
 * 同名冲突时以 `appId-tag` 前缀在全局注册表注册并告警；应用侧看到自己的原始 tag。
 */

export function wrapCustomElements(
  appId: string,
  report: (rule: string, detail: unknown) => void,
): CustomElementRegistry {
  const aliases = new Map<string, string>()
  return {
    define(tag, ctor, options) {
      // 注意：jsdom 的 CustomElementRegistry.get 对未注册 tag 返回 undefined（非 null），
      // 判"已占用"必须同时排除 null 与 undefined
      const isTaken =
        aliases.has(tag) || customElements.get(tag) != null
      let globalTag = tag
      if (isTaken) {
        globalTag = `${appId}-${tag}`
        if (customElements.get(globalTag) != null) {
          // 已被本应用其他路径占用：拒绝并告警
          report('custom-elements-conflict', { tag, globalTag, reason: 'already-defined' })
          return
        }
        report('custom-elements-conflict', { tag, globalTag, reason: 'aliased' })
      }
      customElements.define(globalTag, ctor, options)
      aliases.set(tag, globalTag)
    },
    get(tag) {
      return customElements.get(aliases.get(tag) ?? tag)
    },
    getName(ctor) {
      for (const [alias, globalTag] of aliases) {
        if (customElements.getName(ctor) === globalTag) return alias
      }
      return customElements.getName(ctor)
    },
    upgrade(root) {
      customElements.upgrade(root)
    },
    whenDefined(tag) {
      return customElements.whenDefined(aliases.get(tag) ?? tag)
    },
  }
}
