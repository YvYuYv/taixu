# taixu 示例 —— 一比一还原回归报告（基线模式）

> **回归模式**：参考侧为冻结基线 `QA/baseline/*.json`（taixu 自己上一版的采集快照），
> 用例清单取自 `QA/lib/cases.mjs`，全部走 SPA 点击导航
> （官方站深链会让子应用 html 请求 404，只能从首页点击进入）。
> 不出网、不依赖第三方，适合挂 CI 门禁；有差异即非零退出。
> 生成时间：2026-09-03 02:13:01


---

## Vue 宿主：`baseline/taixu-vue` vs `taixu-vue`

### 1. 布局与计算样式锚点（首页实测）

| 锚点 | 官方期望 | 官方实测 | taixu 实测 | 判定 |
| --- | --- | --- | --- | --- |
| 侧栏宽度 | `210` | ✅ `210` | ✅ `210` | 一致 |
| 内容区起点 x | `210` | ✅ `210` | ✅ `210` | 一致 |
| 侧栏字号 | `20px` | ✅ `20px` | ✅ `20px` | 一致 |
| 侧栏内边距 | `30px 0px` | ✅ `30px 0px` | ✅ `30px 0px` | 一致 |
| 菜单项内边距 | `10px 30px` | ✅ `10px 30px` | ✅ `10px 30px` | 一致 |
| body 字号 | `20px` | ✅ `20px` | ✅ `20px` | 一致 |
| 字体族 | `Avenir` | `Avenir` | `Avenir` | ✅ 一致 |

### 2. 侧栏菜单结构

- 官方 37 项 / taixu 37 项
- ✅ 官方菜单项在 taixu 侧全部存在

<details><summary>菜单项明细</summary>

| # | 官方 | taixu |
| --- | --- | --- |
| 1 | `0:介绍` | `0:介绍` |
| 2 | `0:react16` | `0:react16` |
| 3 | `1:home` | `1:home` |
| 4 | `1:dialog` | `1:dialog` |
| 5 | `1:location` | `1:location` |
| 6 | `1:communication` | `1:communication` |
| 7 | `1:nest` | `1:nest` |
| 8 | `1:font` | `1:font` |
| 9 | `0:react17保活` | `0:react17保活` |
| 10 | `1:home` | `1:home` |
| 11 | `1:dialog` | `1:dialog` |
| 12 | `1:location` | `1:location` |
| 13 | `1:communication` | `1:communication` |
| 14 | `1:state` | `1:state` |
| 15 | `0:vue2` | `0:vue2` |
| 16 | `1:home` | `1:home` |
| 17 | `1:dialog` | `1:dialog` |
| 18 | `1:location` | `1:location` |
| 19 | `1:communication` | `1:communication` |
| 20 | `1:富文本` | `1:富文本` |
| 21 | `1:postmessage` | `1:postmessage` |
| 22 | `0:vue3保活` | `0:vue3保活` |
| 23 | `1:home` | `1:home` |
| 24 | `1:dialog` | `1:dialog` |
| 25 | `1:location` | `1:location` |
| 26 | `1:contact` | `1:contact` |
| 27 | `1:state` | `1:state` |
| 28 | `1:inline-event` | `1:inline-event` |
| 29 | `1:postmessage` | `1:postmessage` |
| 30 | `0:vite` | `0:vite` |
| 31 | `1:home` | `1:home` |
| 32 | `1:dialog` | `1:dialog` |
| 33 | `1:location` | `1:location` |
| 34 | `1:contact` | `1:contact` |
| 35 | `0:angular12` | `0:angular12` |
| 36 | `0:all` | `0:all` |
| 37 | `0:postmessage` | `0:postmessage` |

</details>

### 3. 逐用例：功能点覆盖

| 用例 | 官方 | taixu | 内容字数（官方/taixu） | taixu 未覆盖的功能点 |
| --- | --- | --- | --- | --- |
| `home` | ⚠️ 基线无内容 | — | 0 / 0 | 不可比对（基线未冻结该页） |
| `react16` | 3/3 | 3/3 | 227 / 227 | — |
| `react16/home` | 3/3 | 3/3 | 227 / 227 | — |
| `react16/dialog` | 3/5 | 3/5 | 194 / 194 | — |
| `react16/location` | 3/3 | 3/3 | 300 / 300 | — |
| `react16/communication` | 3/4 | 3/4 | 346 / 346 | — |
| `react16/nest` | 1/1 | 1/1 | 269 / 269 | — |
| `react16/font` | 1/1 | 1/1 | 564 / 564 | — |
| `react17` | 3/3 | 3/3 | 178 / 178 | — |
| `react17/home` | 3/3 | 3/3 | 178 / 178 | — |
| `react17/dialog` | 3/5 | 3/5 | 142 / 142 | — |
| `react17/location` | 3/3 | 3/3 | 200 / 200 | — |
| `react17/communication` | 3/4 | 3/4 | 360 / 360 | — |
| `react17/state` | 3/3 | 3/3 | 165 / 165 | — |
| `vue2` | 3/3 | 3/3 | 222 / 222 | — |
| `vue2/home` | 3/3 | 3/3 | 222 / 222 | — |
| `vue2/dialog` | 5/5 | 5/5 | 318 / 318 | — |
| `vue2/location` | 3/3 | 3/3 | 423 / 423 | — |
| `vue2/communication` | 4/4 | 4/4 | 364 / 364 | — |
| `vue2/rich-text` | 4/4 | 4/4 | 1105 / 1105 | — |
| `vue3` | 3/3 | 3/3 | 238 / 238 | — |
| `vue3/home` | 3/3 | 3/3 | 238 / 238 | — |
| `vue3/dialog` | 4/5 | 4/5 | 251 / 251 | — |
| `vue3/location` | 3/3 | 3/3 | 425 / 425 | — |
| `vue3/contact` | 3/3 | 3/3 | 368 / 368 | — |
| `vue3/state` | 3/3 | 3/3 | 171 / 171 | — |
| `vue3/inline-event` | 6/6 | 6/6 | 598 / 598 | — |
| `vite` | 3/3 | 3/3 | 295 / 295 | — |
| `vite/home` | 3/3 | 3/3 | 295 / 295 | — |
| `vite/dialog` | 4/5 | 4/5 | 157 / 157 | — |
| `vite/location` | 3/3 | 3/3 | 480 / 480 | — |
| `vite/contact` | 3/3 | 3/3 | 348 / 348 | — |
| `angular12` | 1/1 | 1/1 | 263 / 263 | — |
| `all` | 1/1 | 1/1 | 1428 / 1428 | — |
| `postmessage` | 2/2 | 2/2 | 121 / 121 | — |

功能点缺失合计：**0** 项；内容为空用例：**0** 个
✅ 无内容量骤降告警（无页面在功能点通过的前提下字数不足参考侧 0.5 倍）

### 4. 运行时错误

- 基线累计 0 条
- taixu 累计 0 条
- ✅ taixu 侧无运行时错误

---

## React 宿主：`baseline/taixu-react` vs `taixu-react`

### 1. 布局与计算样式锚点（首页实测）

| 锚点 | 官方期望 | 官方实测 | taixu 实测 | 判定 |
| --- | --- | --- | --- | --- |
| 侧栏宽度 | `210` | ✅ `210` | ✅ `210` | 一致 |
| 内容区起点 x | `210` | ✅ `210` | ✅ `210` | 一致 |
| 侧栏字号 | `20px` | ✅ `20px` | ✅ `20px` | 一致 |
| 侧栏内边距 | `30px 0px` | ✅ `30px 0px` | ✅ `30px 0px` | 一致 |
| 菜单项内边距 | `10px 30px` | ✅ `10px 30px` | ✅ `10px 30px` | 一致 |
| body 字号 | `20px` | ✅ `20px` | ✅ `20px` | 一致 |
| 字体族 | `Avenir` | `Avenir` | `Avenir` | ✅ 一致 |

### 2. 侧栏菜单结构

- 官方 36 项 / taixu 36 项
- ✅ 官方菜单项在 taixu 侧全部存在

<details><summary>菜单项明细</summary>

| # | 官方 | taixu |
| --- | --- | --- |
| 1 | `0:介绍` | `0:介绍` |
| 2 | `0:react16` | `0:react16` |
| 3 | `1:home` | `1:home` |
| 4 | `1:dialog` | `1:dialog` |
| 5 | `1:location` | `1:location` |
| 6 | `1:communication` | `1:communication` |
| 7 | `1:nest` | `1:nest` |
| 8 | `1:font` | `1:font` |
| 9 | `0:react17保活` | `0:react17保活` |
| 10 | `1:home` | `1:home` |
| 11 | `1:dialog` | `1:dialog` |
| 12 | `1:location` | `1:location` |
| 13 | `1:communication` | `1:communication` |
| 14 | `1:state` | `1:state` |
| 15 | `0:vue2` | `0:vue2` |
| 16 | `1:home` | `1:home` |
| 17 | `1:dialog` | `1:dialog` |
| 18 | `1:location` | `1:location` |
| 19 | `1:communication` | `1:communication` |
| 20 | `1:富文本` | `1:富文本` |
| 21 | `1:postmessage` | `1:postmessage` |
| 22 | `0:vue3保活` | `0:vue3保活` |
| 23 | `1:home` | `1:home` |
| 24 | `1:dialog` | `1:dialog` |
| 25 | `1:location` | `1:location` |
| 26 | `1:contact` | `1:contact` |
| 27 | `1:state` | `1:state` |
| 28 | `1:inline-event` | `1:inline-event` |
| 29 | `1:postmessage` | `1:postmessage` |
| 30 | `0:vite` | `0:vite` |
| 31 | `1:home` | `1:home` |
| 32 | `1:dialog` | `1:dialog` |
| 33 | `1:location` | `1:location` |
| 34 | `1:contact` | `1:contact` |
| 35 | `0:angular12` | `0:angular12` |
| 36 | `0:all` | `0:all` |

</details>

### 3. 逐用例：功能点覆盖

| 用例 | 官方 | taixu | 内容字数（官方/taixu） | taixu 未覆盖的功能点 |
| --- | --- | --- | --- | --- |
| `home` | ⚠️ 基线无内容 | — | 0 / 0 | 不可比对（基线未冻结该页） |
| `react16` | 3/3 | 3/3 | 227 / 227 | — |
| `react16/home` | 3/3 | 3/3 | 227 / 227 | — |
| `react16/dialog` | 3/5 | 3/5 | 194 / 194 | — |
| `react16/location` | 3/3 | 3/3 | 300 / 300 | — |
| `react16/communication` | 3/4 | 3/4 | 346 / 346 | — |
| `react16/nest` | 1/1 | 1/1 | 269 / 269 | — |
| `react16/font` | 1/1 | 1/1 | 564 / 564 | — |
| `react17` | 3/3 | 3/3 | 178 / 178 | — |
| `react17/home` | 3/3 | 3/3 | 178 / 178 | — |
| `react17/dialog` | 3/5 | 3/5 | 142 / 142 | — |
| `react17/location` | 3/3 | 3/3 | 200 / 200 | — |
| `react17/communication` | 3/4 | 3/4 | 360 / 360 | — |
| `react17/state` | 3/3 | 3/3 | 165 / 165 | — |
| `vue2` | 3/3 | 3/3 | 222 / 222 | — |
| `vue2/home` | 3/3 | 3/3 | 222 / 222 | — |
| `vue2/dialog` | 5/5 | 5/5 | 318 / 318 | — |
| `vue2/location` | 3/3 | 3/3 | 423 / 423 | — |
| `vue2/communication` | 4/4 | 4/4 | 364 / 364 | — |
| `vue3` | 3/3 | 3/3 | 238 / 238 | — |
| `vue3/home` | 3/3 | 3/3 | 238 / 238 | — |
| `vue3/dialog` | 4/5 | 4/5 | 251 / 251 | — |
| `vue3/location` | 3/3 | 3/3 | 425 / 425 | — |
| `vue3/contact` | 3/3 | 3/3 | 368 / 368 | — |
| `vue3/state` | 3/3 | 3/3 | 171 / 171 | — |
| `vue3/inline-event` | 6/6 | 6/6 | 598 / 598 | — |
| `vite` | 3/3 | 3/3 | 295 / 295 | — |
| `vite/home` | 3/3 | 3/3 | 295 / 295 | — |
| `vite/dialog` | 4/5 | 4/5 | 157 / 157 | — |
| `vite/location` | 3/3 | 3/3 | 480 / 480 | — |
| `vite/contact` | 3/3 | 3/3 | 348 / 348 | — |
| `angular12` | 1/1 | 1/1 | 263 / 263 | — |
| `all` | 1/1 | 1/1 | 1428 / 1428 | — |

功能点缺失合计：**0** 项；内容为空用例：**0** 个
✅ 无内容量骤降告警（无页面在功能点通过的前提下字数不足参考侧 0.5 倍）

### 4. 运行时错误

- 基线累计 0 条
- taixu 累计 0 条
- ✅ taixu 侧无运行时错误

---

## 汇总

逐页命中 **0** 处，去重后 **0** 类问题（同名功能点跨用例/跨宿主只算一类）。

### P0 · 功能缺失（必须修）（0）

- 无

### P1 · 功能点/结构不一致（0）

- 无

### P2 · 样式数值偏差（0）

- 无
