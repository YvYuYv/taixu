# 保活池加内存水位二次触发，Chromium 限定、优雅退化

ADR-0019 的数量上限 5 对重型应用失效（5 个 Three.js ≠ 5 个表单）。决策：数量上限为主、内存水位为辅助触发——`performance.memory.usedJSHeapSize / jsHeapSizeLimit > 0.85` 时按 LRU 顺序驱逐（即便池内未满），并 `monitor.capture` 上报"内存压力驱逐"。能力边界如实声明：`performance.memory` 仅 Chromium 系，Firefox/Safari 降级为纯数量上限（优雅退化）。备选"应用自报 memoryHint 加权 LRU"被否：公地悲剧，都会报低。
