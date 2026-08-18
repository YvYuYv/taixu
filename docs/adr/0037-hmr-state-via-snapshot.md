# HMR 复用驱逐快照机制保留状态，不追求模块级热替换

ADR-0011 允许替换非核心服务，但替换触发应用 fiber 重跑 = 整应用重挂载（ADR-0007）= 状态全丢，开发态退到石器时代。决策：开发态 HMR 触发 fiber 重跑前自动执行 ADR-0029 的 local 键空间快照、重跑后注水；CSS 热替换不受影响（样式 effect 独立）。ADR-0029 的快照机制抽象为 lifecycle 内部能力 `snapshotLocalKeys(appId)` / `hydrateLocalKeys(appId, snapshot)`，供驱逐与 HMR 两个调用方复用。备选"模块粒度热替换"被否：Cordis 的 fiber 是插件粒度不是模块粒度，对齐两者是对模型的误用。
