/**
 * 存储命名空间（js-sandbox §3.7）：
 * 真 Storage 接口语义 + Proxy 保留命名属性访问，前缀统一 `__cordis__${appId}__`。
 * 枚举缓存：length/key()/clear() 不做每次全表扫描（旧版缺陷，§3.7 点名修复），
 * 缓存按写操作失效（本命名空间的写必然经过本 Proxy）。
 */

export class StorageNamespace {
  /** 以 Proxy 包装出完整 Storage 形状（含命名属性读写） */
  static wrap(raw: Storage, prefix: string): Storage {
    let cache: Map<string, string> | null = null

    const enumerate = (): Map<string, string> => {
      if (cache) return cache
      const map = new Map<string, string>()
      for (let i = 0; i < raw.length; i++) {
        const k = raw.key(i)
        if (k !== null && k.startsWith(prefix)) map.set(k.slice(prefix.length), raw.getItem(k) ?? '')
      }
      cache = map
      return map
    }
    const invalidate = () => {
      cache = null
    }

    return new Proxy({} as Storage, {
      get: (_t, key: string) => {
        switch (key) {
          case 'length':
            return enumerate().size
          case 'getItem':
            return (k: string) => raw.getItem(prefix + k)
          case 'setItem':
            return (k: string, v: string) => {
              raw.setItem(prefix + k, v)
              invalidate()
            }
          case 'removeItem':
            return (k: string) => {
              raw.removeItem(prefix + k)
              invalidate()
            }
          case 'clear':
            return () => {
              for (const k of enumerate().keys()) raw.removeItem(prefix + k)
              invalidate()
            }
          case 'key':
            return (i: number) => [...enumerate().keys()][i] ?? null
          default:
            break
        }
        if (typeof key !== 'string' || ['then', 'toJSON', 'toString'].includes(key)) {
          return undefined
        }
        return raw.getItem(prefix + key) ?? undefined
      },
      set: (_t, key: string, value) => {
        raw.setItem(prefix + key, String(value))
        invalidate()
        return true
      },
      deleteProperty: (_t, key: string) => {
        raw.removeItem(prefix + key)
        invalidate()
        return true
      },
      has: (_t, key: string) => {
        return typeof key === 'string' && raw.getItem(prefix + key) !== null
      },
    })
  }
}
