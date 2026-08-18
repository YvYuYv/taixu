# security 作为 lifecycle 的显式 inject 依赖，消除启动裁决窗口

scopedFetch 的裁决走 bus 请求-应答；若安全服务 fiber 尚未 ACTIVE，请求会遇"无裁决者"窗口——放行则恶意应用可在冷启动期绕过管控，拒绝则打死合法首屏资源。决策：把 `security` 声明为 `lifecycle` 的显式 `inject` 依赖，利用 Cordis 的响应式 coeffect——安全 fiber 未 ACTIVE 时生命周期 fiber 停在 PENDING，任何应用无法挂载。代价是安全服务故障会导致全部应用无法启动，这正是拒绝优先语义想要的失败模式（fail-closed）。
