/**
 * Vue 3 子应用（@taixu/adapter-vue3）：
 * - default export = taixu Plugin（defineCordisApp 产物，宿主经动态 import 远程加载）
 * - 本地计数：lifecycle.switch 切走再切回（默认保活 suspend/resume），计数不丢
 * - 按钮色 = var(--tx-primary)：主题变量跨应用生效（宿主 :root 唯一写点）
 * - 跨应用共享状态（shared:cart）的读写在 React 子应用与宿主面板演示
 */
import { defineCordisApp } from '@taixu/adapter-vue3'
import { defineComponent, h, ref } from 'vue'

const Vue3App = defineComponent({
  name: 'Vue3App',
  setup() {
    const count = ref(0)
    const increment = () => {
      count.value++
    }
    return () =>
      h('div', { className: 'subcard' }, [
        h('h4', null, 'Vue 3 子应用（@taixu/adapter-vue3）'),
        h('p', null, '保活演示：切到其他子应用再切回，本地状态不丢（suspend/resume 而非 dispose）'),
        h(
          'button',
          { className: 'taixu-btn', onClick: increment },
          [`本地计数: ${count.value}`],
        ),
        h('p', { style: { fontSize: 13, color: '#667' } }, [
          '按钮色取自 var(--tx-primary)（宿主 :root 唯一写点，主题跨应用生效）',
        ]),
      ])
  },
})

export default defineCordisApp({
  appId: 'vue3',
  rootComponent: Vue3App,
})
