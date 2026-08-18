# 版本分裂先提示升级，必须双实例共存时强制 iframe 隔离

deps SemVer 仲裁失败（如 A 要 React 18、B 要 React 17）时两框架实例共存，各自的全局副作用（如 React 17 的 document 事件委托）互相干扰。决策：默认策略是**升级提示**（monitor 上报"版本分裂"，DevTools 提示统一升级）；业务必须双实例共存时**强制走 iframe 沙箱**（物理隔离的 document，事件委托不冲突）而非 Proxy 沙箱。备选"沙箱拦截 document.addEventListener 按应用路由事件"被否：需要理解各框架内部事件机制，脆弱且不可推广。异构加载文档须显式声明"版本分裂 = iframe 隔离触发条件之一"。
