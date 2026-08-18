# 快照经 lz-string 压缩，快照池总量上限 6MB 按 LRU 驱逐

ADR-0029 的单快照 2MB 上限叠加 5 个保活应用可能撑爆 sessionStorage（~5-10MB），`setItem` 抛 QuotaExceededError。决策：(a) 快照经 lz-string 压缩（JSON 文本压缩率 ~70%，CPU 开销 ms 级，驱逐是低频操作可接受）；(b) 快照池**总量上限 6MB** 按 LRU 驱逐最旧快照（哪怕对应应用还在保活池里——快照丢失降级为冷启动，不影响功能）。备选"按应用配额 1MB"被否：对单个重型应用不公平。
