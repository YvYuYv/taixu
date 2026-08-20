# 10 - 驱逐与暖启动：LRU + 水位 + 快照注水

**What to build:** 保活池双重驱逐：LRU 上限（默认 5）+ 内存水位（Chromium-only、0.85、30s 轮询 + 操作触发检查，ADR-0019/0026/0057）。驱逐前自动快照 local: 键空间（lz-string 压缩、快照池 6MB LRU，ADR-0029/0052），重挂载 pre-plugin() 阶段注水；版本漂移则丢弃并上报（ADR-0034/0044）。用户被驱逐后回到应用时 local 状态仍在（暖启动）。

**Blocked by:** 06, 08

**Status:** done

- [x] LRU 驱逐：保活池满时驱逐最久未用（触点更新：挂起/恢复/通信）
- [x] 水位驱逐：`performance.measureUserAgentSpecificMemory` 优先、降级跳过（非 Chromium 不启用）；0.85 阈值 + 30s 轮询 + 挂起/恢复操作触发检查
- [x] 压力候选序：挂起时长 + 快照体积排序（ADR-0031 候选清单）
- [x] 快照：仅 local: 层（global/shared 不入快照，ADR-0044 隐私边界）；lz-string 压缩；池上限 6MB LRU
- [x] 注水：pre-plugin() 阶段 hydrateLocalKeys；版本漂移经纯函数 migrate 或丢弃+上报
- [x] `app/evicted` 事件派发（含 appId/instanceId）
- [x] 配置注入验证：测试经小阈值触发驱逐与快照池回收（不开放服务级缝）

## Answer

- **预算执行**（`src/services/lifecycle.ts` `enforceBudget`）：决策经 idle 回调（§5.4，jsdom 退化为 setTimeout(0)）；挂起/恢复/挂载操作触发 + 30s 轮询兜底（`ctx.effect` 托管清理，非 Chromium 无 memory API 不启轮询，ADR-0057）。数量上限为主（默认 5，LRU 键 `lastAccessAt`，挂起/恢复/通信三触点刷新）；水位辅助**每轮检查至多驱逐一个**（压力常驻由后续检查接力，给 GC 留时间）。
- **水位检查**（`underPressure`）：`performance.measureUserAgentSpecificMemory` 优先（分母 = `memoryLimitBytes` 配置或 legacy `jsHeapSizeLimit`），降级 `performance.memory` 比率（0.85 阈值），两者皆无（非 Chromium）优雅退化跳过（ADR-0026）。
- **压力候选序**（`pickPressureCandidate`）：`suspendedAt`（首次挂起时刻）降序 + 快照体积并列裁决（ADR-0031 候选清单——与 LRU 键刻意不同：消息触达刷新 lastAccessAt 不影响候选序）。
- **驱逐**（`evict`）：快照先行（destroy 会经 app/disposed 回收 local 键空间）→ §3.2 destroy 真正释放 → `app/evicted {appId, instanceId, cause: 'lru'|'pressure'}` + 水位路径 `monitor.capture('内存压力驱逐')`。
- **快照**（`snapshotLocalKeys`）：`state.dumpLocal` 仅导 `local:{appId}:` 层（ADR-0044）；lz-string `compressToUTF16` 落 sessionStorage `__tx_snapshot:{appId}`；单快照 >2MB 放弃（cordis-alignment 基线，同时清旧防残留）；池总量 6MB LRU 回收最旧（ADR-0052）。
- **注水**（`hydrateLocalKeys`，mountOnce 步骤 3.5 = plugin() 之前）：版本匹配直接注水；漂移经 manifest `migrate(data, fromVersion)` 纯函数迁移（`defineApp` 第三参声明 `{version, migrate}`）；无 migrate 丢弃 + `monitor.capture('快照版本漂移丢弃')`；损坏快照同样降级冷启动；快照一次性消费（用后即删，生命周期跟随驱逐）。`state.hydrateLocal` 走唯一写管线、系统身份、前缀再过滤。
- **测试**（`tests/eviction.test.ts`，8 例主缝，全经 `createCordis({ keepAlive: 小阈值 })`）：LRU 驱逐+快照落池+事件、local-only 隐私边界、快照池 LRU 回收、pre-plugin 暖启动、版本漂移丢弃+上报、migrate 迁移、水位操作触发驱逐+内存压力上报、候选序按挂起时长（非 lastAccessAt）。全量 124 绿灯。

## Comments

- 双轴审查发现并已修复：`hydrateLocalKeys` 曾无守卫 `JSON.parse`（损坏快照会炸挂载事务）→ catch + 降级冷启动 + 上报；快照用后不删（非驱逐销毁后残留旧态会注回下次冷启动）→ 一次性消费；单快照曾无 >2MB 放弃守卫（cordis-alignment 基线）→ 补上并清旧；`app/evicted` 增补 `cause` 判别字段（消除 evict 死参数）；`underPressure` mUASM 分支曾硬依赖 legacy `jsHeapSizeLimit`（新 API-only 环境成死路）→ `memoryLimitBytes` 配置分母；perf cast 重复提取 `memoryPerf()`。
- 文档建议（未改动，票面外）：lifecycle-management.md §5.4 `KeepAliveConfig` 接口块缺 `watermark/pollMs/snapshotPoolBytes/memoryLimitBytes`；§5.4"按 LRU 顺序驱逐（水位）"与 §5.1.1/票面的候选序（挂起时长）措辞需统一。
- 遗留（票面外，后续票/跟进）：`ttlMs` 单实例最长保活 + `document.hidden` 暂停计时（§5.4 尾条）；快照池跨会话账本（本会话 Map 不感知上一会话残留键，trim 只见本会话）；HMR 复用快照（ADR-0037，快照/注水原语已就绪）。
