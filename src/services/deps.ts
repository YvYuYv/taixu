/**
 * deps 最小加载（heterogeneous-loading §三，本票裁剪版）：
 * - manifest 校验（应用清单存在性 + 入口形状）
 * - 入口直载（单版本直载；importmap/共享仲裁矩阵不在本票，见 spec Out of Scope）
 * - AbortSignal 全程透传："结果作废 + 未开始的阶段不再开始"（lifecycle §2.2-3）
 */
import { Service, type Context } from 'cordis'
import '../events'

/** 应用清单条目（宿主经 createCordis({ apps }) 声明） */
export interface AppManifestEntry {
  appId: string
  /** 入口工厂：返回 Cordis 插件（函数/对象/类） */
  entry: () => unknown
}

export interface DepsConfig {
  apps?: AppManifestEntry[]
}

/**
 * deps 服务：资源加载与入口解析。
 * 完整形态（manifest fetch/SRI/importmap/共享仲裁）见 heterogeneous-loading §六/§七。
 */
export class DepsService extends Service<DepsConfig> {
  static provide = 'deps'
  static inject = ['security', 'monitor']

  private appConfig: DepsConfig

  constructor(ctx: Context, config: DepsConfig = {}) {
    super(ctx, 'deps')
    this.appConfig = config
  }

  /**
   * 加载应用入口，解析为 Cordis 插件。
   * 本票：清单校验 + 工厂调用（直载）。signal 语义：加载已开始则作废结果，未开始则不再开始。
   */
  async loadApp(appId: string, options: { signal?: AbortSignal } = {}): Promise<unknown> {
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const entry = this.appConfig.apps?.find((a: AppManifestEntry) => a.appId === appId)
    if (!entry) {
      throw new Error(`manifest: app "${appId}" is not declared in host config`)
    }
    const plugin = await entry.entry()
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return plugin
  }
}

declare module 'cordis' {
  interface Context {
    deps: DepsService
  }
}
