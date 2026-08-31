/**
 * Vite 构建的 Vue 3 子应用（对齐 wujie 示例的 vite 子应用：构建工具差异化）：
 * - 功能形态 = Todo 列表（演示子应用内部交互 + 主题变量消费）
 * - 本条目在构建脚本里与 vue3 同为 Vue 3，但独立构建为自包含 ESM
 */
import { defineCordisApp } from '@taixu/adapter-vue3'
import { defineComponent, h, ref } from 'vue'

const ViteApp = defineComponent({
  name: 'ViteApp',
  setup() {
    const todos = ref<Array<{ text: string; done: boolean }>>([
      { text: '了解 taixu 槽位矩阵', done: true },
      { text: '体验保活切换', done: false },
    ])
    const draft = ref('')
    const add = () => {
      if (!draft.value.trim()) return
      todos.value.push({ text: draft.value.trim(), done: false })
      draft.value = ''
    }
    const toggle = (i: number) => {
      todos.value[i]!.done = !todos.value[i]!.done
    }
    return () =>
      h('div', { className: 'subcard' }, [
        h('h4', null, 'Vite 构建的 Vue 3 子应用（构建工具差异化）'),
        h(
          'div',
          null,
          todos.value.map((t, i) =>
            h(
              'label',
              { key: i, style: { display: 'block', fontSize: 14, padding: '3px 0', cursor: 'pointer' } },
              [
                h('input', {
                  type: 'checkbox',
                  checked: t.done,
                  onChange: () => toggle(i),
                  style: { marginRight: 6 },
                }),
                h('span', { style: t.done ? { textDecoration: 'line-through', color: '#99a' } : {} }, [t.text]),
              ],
            ),
          ),
        ),
        h('div', { style: { marginTop: 8 } }, [
          h('input', {
            value: draft.value,
            onInput: (e: Event) => {
              draft.value = (e.target as HTMLInputElement).value
            },
            onKeydown: (e: KeyboardEvent) => {
              if (e.key === 'Enter') add()
            },
            placeholder: '新增待办，回车提交',
            style: { padding: '6px 10px', border: '1px solid #d5daea', borderRadius: 6, width: 220 },
          }),
          h('button', { className: 'taixu-btn', onClick: add, style: { marginLeft: 8 } }, ['添加']),
        ]),
      ])
  },
})

export default defineCordisApp({
  appId: 'vite',
  rootComponent: ViteApp,
})
