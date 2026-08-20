# 09 - 恢复三通道收口：state/sync + outlet 重放

**What to build:** 挂起的应用恢复时三条通道按统一时序收口：state 走拉模型（挂起期间不推送 `state/changed`，恢复时一次性 `state/sync` 同步 watch 键集合，ADR-0023）；router 对该槽位重放一次 `outlet/changed:{outlet}`（应用像响应正常导航一样同步，ADR-0056）；bus 回放以原 traceparent 为 span link 开新 span（ADR-0030）。集成测试验证三通道时序无交错。

**Blocked by:** 06, 08

**Status:** done

- [x] 挂起期间该应用不收 `state/changed` 推送；恢复时收到一次性 `state/sync {keys}`（含 value+version）
- [x] 恢复后槽位事件重放一次：应用视图同步与正常导航同路径（无第二套恢复机制）
- [x] 回放 span link：每条回放消息以原 traceparent 链接开新 span（monitor 可关联挂起前后链路）
- [x] 恢复时序集成测试：state/sync -> outlet 重放 -> 消息回放 的顺序断言（经主缝探针观察）
- [x] 分级恢复覆盖语义验收（ADR-0031）：路由级恢复不覆盖命令级 resume

## Answer

- **统一时序编排**（`src/services/lifecycle.ts` `resumeInstance`）：lifecycle 是唯一编排者（ADR-0054），恢复动作末尾按序派发三个契约事件——`app/resume`（state 在其 global 监听中收口一次性 `state/sync`，ADR-0023）→ `router/replay {instanceId, outlet}`（ADR-0056）→ `bus/replay {instanceId}`（ADR-0015）。事件即编排接口，state/router/bus 互不感知、不 inject lifecycle（基线 §2.3 依赖方向保持）。
- **router 重放**（`src/services/router.ts`）：`router/replay` global 监听 → 复用 `outletEventKey` + `this.match` 对该槽位重放一次 `outlet/changed:{outlet}`（载荷 = 当前匹配结果）——与正常导航同一事件同一机制，无第二套恢复路径。
- **bus 回放触发迁移 + span link**（`src/services/bus.ts`）：回放触发从 `app/resume` 改为 `bus/replay`（进入统一时序第三步）；每条回放消息经 `linkSpan`——有原 traceparent 则保持 traceId、换新 spanId（span 时长只计真实处理时间，ADR-0030）；无/不可解析时**原样透传**（非 OTel 兼容降级 = 如实长 span，不伪造新 trace 切断关联）。
- **state 通道**（06 号票已有，本票验收时序落位）：挂起期间 watch 投递按 appId 抑制；恢复 `state/sync {keys: Record<key, {value, version}>}` 一次性同步该应用 watch 键集合。
- **测试**（`tests/resume.test.ts`，5 例）：state 抑制+sync 载荷、outlet 恰好重放一次、三通道顺序 `['state-sync','outlet','msg']` 无交错（主缝探针）、span link（traceId 保持 + spanId 换新，经 `parseTraceparent` 断言）、ADR-0031 分级恢复（命令恢复解除不了路由挂起；路由恢复解除全部；active 幂等）。全量 116 绿灯。

## Comments

- 双轴审查发现并已修复：`linkSpan` 无 traceparent 时曾伪造全新 traceId（违反 §七-5"非 OTel 兼容降级为如实长 span"）→ 改为原样透传；补 `router/replay`/`bus/replay` 载荷不对称的契约注释（槽位 vs 目标应用作用域）。
- 票面第 5 条措辞（"路由级恢复不覆盖命令级 resume"）与 ADR-0031 正文（高优先级恢复可解除全部低优先级挂起）方向相反；按 ADR-0018/0031 语义实现并验收：低优先级（命令）恢复解除不了高优先级（路由）挂起。若票面另有所指请重开。
- 多帧回放（>50 条）时序由架构保证（state/outlet 同步 emit 严格先于逐帧回放），集成测试以单消息断言端到端顺序。
