# 06 - 状态：三层键空间 + 写管线 + 订阅

**What to build:** 应用经 state 服务读写三层键空间（global: / shared: / local:{appId}:）：每次写经权限校验 + 版本推进后单次通知；应用用 `ctx.on('state/changed')`（带键过滤）订阅、dispose 自动退订。local: 层以"键前缀 + fiber 归属校验"隔离（禁用 isolate），`local:` 键只接受 JSON 可序列化值（快照前提）。

**Blocked by:** 01

**Status:** resolved

- [x] 三层键空间：global / shared / local:{appId}: 前缀语义与可见性
- [x] 唯一写入管线：权限校验（security 接线点就位，全链 fail-closed 在 11 验收）-> 版本推进 -> 单次通知
- [x] 订阅 = `ctx.on('state/changed')` + 键过滤；首运行值即送；dispose 自动退订（ADR-0001）
- [x] local: 隔离 = 键前缀 + fiber 归属校验（ADR-0003：禁 `ctx.isolate('state')`）
- [x] `local:` 键使用条款：JSON 可序列化、拒绝 token/密码/PII 键名（写入时校验并上报）
- [x] 深层代理身份稳定（同一路径多次访问同引用）
- [x] state 感知挂起经监听 app/suspend/app/resume 事件（不 inject lifecycle，ADR-0023 的挂起分支在 08/09 验收）

## Answer

`StateService`（`static provide = 'state'`，`inject: ['security','monitor']`，不 inject lifecycle——基线 §2.3）落进 createCordis 主缝：

- **三层键空间（§三）**：键前缀（非平行 Map），`state/changed` 携带全限定键。`global:` 全可见（授权读）；`shared:` 按 security 授权读写；`local:{appId}:` owner 自动授予（键前缀归属校验，ADR-0003 禁 isolate）、跨应用读写即拒（reportViolation + throw）。应用 dispose（app/disposed global 监听）整体回收 `local:{appId}:` 键空间。
- **唯一写管线（§4.1）**：`set`/`setDeep`/代理 set trap 全走 `assertWritable`（deny-by-default，local owner 自动授予）→ `commit`（版本与值原子推进 + 单次 `state/changed`）。读也校验（`assertReadable`）。权限 action = `state:read:{key}` / `state:write:{key}`，security matchAction 扩展 `.*` 点分通配（`state:write:shared:cart.*` 覆盖深层路径，冒号/点分一体）。
- **订阅（§4.3，ADR-0001）**：`watch(ctx, key, fn, {appId?})` = `ctx.on('state/changed')` 托管（dispose 自动退订）+ 双向键过滤（watch('k') 收 'k.x'；watch('k.x') 收根键 'k' 提交且取子路径值）+ 首跑同步送当前值（子路径经根存储下钻；**首跑与投递均过读权限，无旁路**）。
- **local: 使用条款（ADR-0029/0044）**：深层扫描式 JSON 可序列化校验（函数/symbol/bigint/DOM/循环引用/Map/Set 均拒）；敏感键名黑名单（token/password/passwd/secret/credential/pii，不区分大小写）写入即拒 + `security/violation {rule:'state-sensitive-key'}` 上报。
- **深层代理（§4.2）**：`(key, version, owner)` 三元缓存身份稳定；receiver 正确传递；set trap 走唯一管线（**带 proxy 持有者 appId 归因**，拒绝时不污染本地视图）、old 为真实 prev、path 全限定。Map/Set/Date 不代理（原样返回）。
- **挂起感知（ADR-0023）**：constructor 注册 `app/suspend`/`app/resume`（root + global）；挂起应用不推送 `state/changed`（拉模型），恢复按 watch 键集合派发一次性 `state/sync {instanceId, keys}`。

测试 `tests/state.test.ts`（15 例）全走主缝；全量 86/86 绿，tsc 通过。

## Comments

- **code-review 双轴发现与修复**：
  - Spec 重量级打回：**代理 set trap 绕过写管线**（trap 曾传空 options = 系统身份免检 + 先改活对象再 clone 导致 old 失真）→ trap 改为先取 prev、经 `setDeep({appId: 归因, old: prev})` 走管线、拒绝即不变更，补"未授权应用深层写入即拒"测试；**watch 读旁路**（首跑/投递曾不校验读权限）→ 双点 fail-closed；**local 键空间 dispose 不回收**（§三强制条款）→ app/disposed 监听批量删除，补测试；键过滤单向（子路径观察者收不到根提交）→ 双向 + 子路径取值下钻。
  - Standards：get/assertWritable 重复的裁决-上报-抛错序列 → 提 `assertReadable/canRead/canWrite` helper；watchers Map 在注释中显式声明为"归因数据非退订表"（ADR-0001 禁的是第二套生命周期真相源；退订本身由 ctx.on 托管）；`冒冒`错字修正。
  - 记录性偏离：挂起测试以 root 层合成 `app/suspend`/`app/resume` 事件驱动（08/09 号票接真实 lifecycle 挂起后回归全链）；`local:{appId}:` 不含 instanceId 段——依票面（What to build 原文），§三的 instanceId 维度在 08 多实例保活落地时补；敏感值载荷脱敏（`"[redacted]"`，§五）与 sanitizeQuery 同在 11 号票 security 接线时统一落。
- cordis v4 API 事实追加：root fiber 的 `fiber.name === 'root'`（name getter 沿父链上溯）——应用归因判断以此为界；`ctx.on` 非全局监听器可收到 root 发出的事件（无 isolate 时 filter 放行），state/changed 的应用侧订阅即依赖此行为。
- `setIfMatch`/`batch`（§4.4/§4.5 冲突与原子批写）不在本票 checkbox，按 §九 P1 顺延。
