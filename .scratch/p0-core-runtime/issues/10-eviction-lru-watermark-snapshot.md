# 10 - 驱逐与暖启动：LRU + 水位 + 快照注水

**What to build:** 保活池双重驱逐：LRU 上限（默认 5）+ 内存水位（Chromium-only、0.85、30s 轮询 + 操作触发检查，ADR-0019/0026/0057）。驱逐前自动快照 local: 键空间（lz-string 压缩、快照池 6MB LRU，ADR-0029/0052），重挂载 pre-plugin() 阶段注水；版本漂移则丢弃并上报（ADR-0034/0044）。用户被驱逐后回到应用时 local 状态仍在（暖启动）。

**Blocked by:** 06, 08

**Status:** ready-for-agent

- [ ] LRU 驱逐：保活池满时驱逐最久未用（触点更新：挂起/恢复/通信）
- [ ] 水位驱逐：`performance.measureUserAgentSpecificMemory` 优先、降级跳过（非 Chromium 不启用）；0.85 阈值 + 30s 轮询 + 挂起/恢复操作触发检查
- [ ] 压力候选序：挂起时长 + 快照体积排序（ADR-0031 候选清单）
- [ ] 快照：仅 local: 层（global/shared 不入快照，ADR-0044 隐私边界）；lz-string 压缩；池上限 6MB LRU
- [ ] 注水：pre-plugin() 阶段 hydrateLocalKeys；版本漂移经纯函数 migrate 或丢弃+上报
- [ ] `app/evicted` 事件派发（含 appId/instanceId）
- [ ] 配置注入验证：测试经小阈值触发驱逐与快照池回收（不开放服务级缝）
