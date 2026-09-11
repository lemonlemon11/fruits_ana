import { createApp, h } from 'vue'

import './src/styles.css'
import './src/styles-shell.css'
import './src/styles-auth.css'
import BrandMark from './src/components/BrandMark.vue'

const Cell = (props: { label: string; children: () => unknown }) =>
  h('div', { style: 'display:grid;gap:8px;justify-items:start' }, [
    h('span', { style: 'font-size:12px;color:#56635b' }, props.label),
    props.children(),
  ])

const Lockup = (tone: 'solid' | 'inverse', onDark: boolean) =>
  h(
    'div',
    {
      style: `display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:6px;background:${onDark ? '#0c2417' : '#ffffff'};border:1px solid ${onDark ? '#0c2417' : '#d4dbd6'};color:${onDark ? '#fff' : '#1f2923'}`,
    },
    [
      h(BrandMark, { size: 38, tone }),
      h('strong', { style: 'font-size:1rem;line-height:1.35;max-width:150px' }, 'SLD-水果市场销售分析'),
    ],
  )

const App = {
  render: () =>
    h('div', { style: 'display:grid;gap:22px;padding:26px' }, [
      h('h1', { style: 'font-size:18px;margin:0' }, 'BrandMark 组件自检'),
      h('div', { style: 'display:flex;gap:22px;align-items:flex-end' }, [
        Cell({ label: 'solid 38', children: () => h(BrandMark, { size: 38 }) }),
        Cell({ label: 'solid 34', children: () => h(BrandMark, { size: 34 }) }),
        Cell({ label: 'solid 28', children: () => h(BrandMark, { size: 28 }) }),
        Cell({ label: 'solid 16', children: () => h(BrandMark, { size: 16 }) }),
        Cell({ label: 'inverse 42', children: () => h(BrandMark, { size: 42, tone: 'inverse' }) }),
      ]),
      h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:760px' }, [
        Lockup('solid', false),
        Lockup('inverse', true),
      ]),
    ]),
}
createApp(App).mount('#app')
