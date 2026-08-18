# 02 - 沙箱工厂 + 逃逸向量缓解

**What to build:** 探针应用运行在注入过的 globalThis（双窗口 Proxy 沙箱）中：它对 window 的写入被隔离、dispose 后全部回收；10 项逃逸向量（constructor 链 / getPrototypeOf / unscopables / Worker / ServiceWorker / 网络面等，见 js-sandbox 逃逸向量表）各自有清单化缓解。沙箱每应用实例化、不池化。

**Blocked by:** 01（探针应用与测试基座）

**Status:** ready-for-agent

- [ ] 双窗口 Proxy：trap 语义正确、has 恒 true、location 读写统一重定向 router
- [ ] 逃逸向量 10 项逐一缓解并有工厂直测（本票为唯一允许的服务级直测缝）
- [ ] Document 代理 scoped 查询 + 全路径注入记账（样式 appendChild 自动登记的挂点，登记语义在 04 验收）
- [ ] 存储命名空间接线（真前缀，非空壳）
- [ ] 沙箱创建动作挂 effect（dispose 幂等双保险：lifecycle 显式 + fiber effect）
- [ ] 定位声明可见：沙箱是污染隔离不是安全边界
