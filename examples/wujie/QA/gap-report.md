# wujie 官方示例 × taixu 重写版 —— 一比一还原差异报告

> 生成方式：同一份用例清单（`QA/lib/cases.mjs`，取自 wujie 官方菜单树）分别跑 4 个目标，
> 全部走 SPA 点击导航（官方站深链会让子应用 html 请求 404，只能从首页点击进入）。
> 生成时间：2026-09-02 11:21:11


---

## Vue 宿主：`official-vue` vs `taixu-vue`

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

- 官方 35 项 / taixu 37 项
- ✅ 官方菜单项在 taixu 侧全部存在
- ➕ taixu 扩展（官方无）：`1:postmessage`、`1:postmessage`

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
| 21 | `0:vue3保活` | **`1:postmessage`** |
| 22 | `1:home` | **`0:vue3保活`** |
| 23 | `1:dialog` | **`1:home`** |
| 24 | `1:location` | **`1:dialog`** |
| 25 | `1:contact` | **`1:location`** |
| 26 | `1:state` | **`1:contact`** |
| 27 | `1:inline-event` | **`1:state`** |
| 28 | `0:vite` | **`1:inline-event`** |
| 29 | `1:home` | **`1:postmessage`** |
| 30 | `1:dialog` | **`0:vite`** |
| 31 | `1:location` | **`1:home`** |
| 32 | `1:contact` | **`1:dialog`** |
| 33 | `0:angular12` | **`1:location`** |
| 34 | `0:all` | **`1:contact`** |
| 35 | `0:postmessage` | **`0:angular12`** |
| 36 | `—` | **`0:all`** |
| 37 | `—` | **`0:postmessage`** |

</details>

### 3. 逐用例：功能点覆盖

| 用例 | 官方 | taixu | 内容字数（官方/taixu） | taixu 未覆盖的功能点 |
| --- | --- | --- | --- | --- |
| `home` | ⚠️ 官方侧无内容 | — | 0 / 0 | 不可比对（官方站该页不可用） |
| `react16` | 3/3 | 3/3 | 76 / 227 | — |
| `react16/home` | 3/3 | 3/3 | 76 / 227 | — |
| `react16/dialog` | 3/5 | 3/5 | 121 / 194 | — |
| `react16/location` | 3/3 | 3/3 | 321 / 300 | — |
| `react16/communication` | 3/4 | 3/4 | 371 / 346 | — |
| `react16/nest` | 1/1 | 1/1 | 33 / 269 | — |
| `react16/font` | 1/1 | 1/1 | 434 / 564 | — |
| `react17` | 3/3 | 3/3 | 70 / 178 | — |
| `react17/home` | 3/3 | 3/3 | 70 / 178 | — |
| `react17/dialog` | 3/5 | 3/5 | 116 / 142 | — |
| `react17/location` | 3/3 | 3/3 | 316 / 200 | — |
| `react17/communication` | 3/4 | 3/4 | 375 / 360 | — |
| `react17/state` | 3/3 | 3/3 | 111 / 165 | — |
| `vue2` | 3/3 | 3/3 | 94 / 222 | — |
| `vue2/home` | 3/3 | 3/3 | 94 / 222 | — |
| `vue2/dialog` | 5/5 | 5/5 | 326 / 318 | — |
| `vue2/location` | 3/3 | 3/3 | 280 / 423 | — |
| `vue2/communication` | 4/4 | 4/4 | 517 / 364 | — |
| `vue2/rich-text` | 4/4 | 4/4 | 2028 / 1105 | — |
| `vue3` | 3/3 | 3/3 | 104 / 238 | — |
| `vue3/home` | 3/3 | 3/3 | 104 / 238 | — |
| `vue3/dialog` | 4/5 | 4/5 | 192 / 251 | — |
| `vue3/location` | 3/3 | 3/3 | 286 / 425 | — |
| `vue3/contact` | 3/3 | 3/3 | 373 / 368 | — |
| `vue3/state` | 3/3 | 3/3 | 114 / 171 | — |
| `vue3/inline-event` | 6/6 | 6/6 | 485 / 598 | — |
| `vite` | 3/3 | 3/3 | 114 / 295 | — |
| `vite/home` | 3/3 | 3/3 | 114 / 295 | — |
| `vite/dialog` | 4/5 | 4/5 | 180 / 157 | — |
| `vite/location` | 3/3 | 3/3 | 449 / 480 | — |
| `vite/contact` | 3/3 | 3/3 | 361 / 348 | — |
| `angular12` | ⚠️ 官方侧无内容 | — | 0 / 263 | 不可比对（官方站该页不可用） |
| `all` | 1/1 | 1/1 | 462 / 1428 | — |
| `postmessage` | 2/2 | 2/2 | 33 / 121 | — |

功能点缺失合计：**0** 项；内容为空用例：**0** 个
✅ 无内容量骤降告警（无页面在功能点通过的前提下字数不足参考侧 0.5 倍）

### 4. 运行时错误

- 官方站点累计 141 条（含 wujie 自身的子应用 html 404 与降级告警）
- taixu 累计 0 条
- ✅ taixu 侧无运行时错误

---

## React 宿主：`official-react` vs `taixu-react`

### 1. 布局与计算样式锚点（首页实测）

| 锚点 | 官方期望 | 官方实测 | taixu 实测 | 判定 |
| --- | --- | --- | --- | --- |
| 侧栏宽度 | `210` | ✅ `210` | ✅ `210` | 一致 |
| 内容区起点 x | `210` | ✅ `210` | ✅ `210` | 一致 |
| 侧栏字号 | `20px` | ✅ `20px` | ✅ `20px` | 一致 |
| 侧栏内边距 | `30px 0px` | ✅ `30px 0px` | ✅ `30px 0px` | 一致 |
| 菜单项内边距 | `10px 30px` | ⚠️ `11px 30px` | ✅ `10px 30px` | 一致 |
| body 字号 | `20px` | ✅ `20px` | ✅ `20px` | 一致 |
| 字体族 | `Avenir` | `Avenir` | `Avenir` | ✅ 一致 |

### 2. 侧栏菜单结构

- 官方 33 项 / taixu 36 项
- ✅ 官方菜单项在 taixu 侧全部存在
- ➕ taixu 扩展（官方无）：`1:富文本`、`1:postmessage`、`1:postmessage`

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
| 20 | `0:vue3保活` | **`1:富文本`** |
| 21 | `1:home` | **`1:postmessage`** |
| 22 | `1:dialog` | **`0:vue3保活`** |
| 23 | `1:location` | **`1:home`** |
| 24 | `1:contact` | **`1:dialog`** |
| 25 | `1:state` | **`1:location`** |
| 26 | `1:inline-event` | **`1:contact`** |
| 27 | `0:vite` | **`1:state`** |
| 28 | `1:home` | **`1:inline-event`** |
| 29 | `1:dialog` | **`1:postmessage`** |
| 30 | `1:location` | **`0:vite`** |
| 31 | `1:contact` | **`1:home`** |
| 32 | `0:angular12` | **`1:dialog`** |
| 33 | `0:all` | **`1:location`** |
| 34 | `—` | **`1:contact`** |
| 35 | `—` | **`0:angular12`** |
| 36 | `—` | **`0:all`** |

</details>

### 3. 逐用例：功能点覆盖

| 用例 | 官方 | taixu | 内容字数（官方/taixu） | taixu 未覆盖的功能点 |
| --- | --- | --- | --- | --- |
| `home` | ⚠️ 官方侧无内容 | — | 0 / 0 | 不可比对（官方站该页不可用） |
| `react16` | 3/3 | 3/3 | 76 / 227 | — |
| `react16/home` | 3/3 | 3/3 | 76 / 227 | — |
| `react16/dialog` | 3/5 | 3/5 | 121 / 194 | — |
| `react16/location` | 3/3 | 3/3 | 321 / 300 | — |
| `react16/communication` | 3/4 | 3/4 | 371 / 346 | — |
| `react16/nest` | 1/1 | 1/1 | 33 / 269 | — |
| `react16/font` | 1/1 | 1/1 | 434 / 564 | — |
| `react17` | 3/3 | 3/3 | 70 / 178 | — |
| `react17/home` | 3/3 | 3/3 | 70 / 178 | — |
| `react17/dialog` | 3/5 | 3/5 | 116 / 142 | — |
| `react17/location` | 3/3 | 3/3 | 316 / 200 | — |
| `react17/communication` | 3/4 | 3/4 | 375 / 360 | — |
| `react17/state` | 3/3 | 3/3 | 111 / 165 | — |
| `vue2` | 3/3 | 3/3 | 94 / 222 | — |
| `vue2/home` | 3/3 | 3/3 | 94 / 222 | — |
| `vue2/dialog` | 5/5 | 5/5 | 326 / 318 | — |
| `vue2/location` | 3/3 | 3/3 | 280 / 423 | — |
| `vue2/communication` | 4/4 | 4/4 | 517 / 364 | — |
| `vue3` | 3/3 | 3/3 | 104 / 238 | — |
| `vue3/home` | 3/3 | 3/3 | 104 / 238 | — |
| `vue3/dialog` | 4/5 | 4/5 | 192 / 251 | — |
| `vue3/location` | 3/3 | 3/3 | 286 / 425 | — |
| `vue3/contact` | 3/3 | 3/3 | 373 / 368 | — |
| `vue3/state` | 3/3 | 3/3 | 114 / 171 | — |
| `vue3/inline-event` | 6/6 | 6/6 | 485 / 598 | — |
| `vite` | 3/3 | 3/3 | 114 / 295 | — |
| `vite/home` | 3/3 | 3/3 | 114 / 295 | — |
| `vite/dialog` | 4/5 | 4/5 | 180 / 157 | — |
| `vite/location` | 3/3 | 3/3 | 449 / 480 | — |
| `vite/contact` | 3/3 | 3/3 | 361 / 348 | — |
| `angular12` | ⚠️ 官方侧无内容 | — | 0 / 263 | 不可比对（官方站该页不可用） |
| `all` | 1/1 | 1/1 | 462 / 1428 | — |

功能点缺失合计：**0** 项；内容为空用例：**0** 个
✅ 无内容量骤降告警（无页面在功能点通过的前提下字数不足参考侧 0.5 倍）

### 4. 运行时错误

- 官方站点累计 66 条（含 wujie 自身的子应用 html 404 与降级告警）
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
