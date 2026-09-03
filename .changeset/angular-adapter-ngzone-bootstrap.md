---
"@taixu/adapter-angular": patch
---

fix: bootstrap 包进 ngZone.run——`ApplicationRef.bootstrap` 不自带 zone 包裹，
`await createApplication()` 之后再调用会让组件树全部 DOM 事件监听注册在根 zone
（task.zone=<root>），NgZone 稳定化永不触发、视图冻结首屏。现从 `app.injector`
取 NgZone token 包裹 bootstrap；宿主 facade 需随 `@angular/core` 传入 `NgZone`
token（缺失时维持旧行为）。
