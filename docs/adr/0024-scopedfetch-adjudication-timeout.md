# scopedFetch 裁决 fail-closed + 5s 超时 + 超时上报

scopedFetch 的 serial 裁决若因安全服务 bug 或永远不 resolve 的中间件而永久阻塞，应用全部网络请求卡死，且 serial 无内置超时。决策：scopedFetch 内置默认 5s 超时，超时视为 `{ok:false, reason:'adjudication-timeout'}` **拒绝**（fail-closed，与 ADR-0009 一致），并 `monitor.capture` 上报裁决超时作为 security 服务的健康信号；连续 N 次超时升级为告警。备选 fail-open 被否：安全服务出 bug 的瞬间管控全开。备选"整树降级"被否：一个中间件挂起不应瘫痪全部应用。
