# 沙箱网络作用域由生命周期在创建后注入

原设计让沙箱服务在创建时自行注入 `scopedFetch`，但 scopedFetch 依赖 bus（网络请求走总线裁决），而沙箱创建早于 bus 对应用的可用时点，且沙箱服务不应持有总线依赖（会引入 deps→sandbox→bus 的服务环）。决策：沙箱只负责创建干净执行环境；`scopedFetch` 由生命周期服务在沙箱创建之后、`ctx.plugin()` 激活应用之前注入——生命周期本就按序持有 deps/sandbox/bus 三个依赖，注入时序天然成立，无服务环。
