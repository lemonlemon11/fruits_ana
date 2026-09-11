import { createApp, h, ref } from 'vue'

import '../src/styles.css'
import '../src/styles-shell.css'
import './showcase.css'
import AiAnalysisCard from '../src/components/AiAnalysisCard.vue'
import SettlementPicker from '../src/components/SettlementPicker.vue'
import { normalizeSettlementList } from '../src/api/normalize.ts'
import { GRADE_DETAIL_HEADINGS } from '../src/utils/seriesAnalysis.ts'
import fixture from './fixture.json'
import { CONCLUSION } from './review-data.ts'

// 视觉伴侣呈现页：用真实组件 + 真实结算单数据，展示本轮两处改动。

const list = normalizeSettlementList(fixture.settlements)

const CHANGES = [
  ['AI 结论更醒目', '主色强调卡片 + 「AI 解读」徽标；关键数字自动加粗放大；「可以留意的地方」换暖色底。'],
  ['分析更深', '对比数字由后端先算好（排名、极值差、同级价差、品质标记对比），模型只负责解读，并必须给出可照做的建议。'],
  ['选择结算单可扩展', '不再把全部结算单平铺在页面上：主页面只留已选摘要，点按钮打开抽屉搜索挑选，点「确定」才刷新一次。'],
]

const Showcase = {
  setup() {
    const selected = ref(['640', '单637'])
    const run = () =>
      Promise.resolve({
        content: CONCLUSION,
        model: 'deepseek-v4-flash',
        generatedAt: new Date().toISOString(),
        cached: true,
      })

    // 预览用：挂载后自动点一次「生成号别小结」，直接看到成品结论。
    setTimeout(() => {
      const button = document.querySelector<HTMLButtonElement>('.ai-actions .primary-button')
      button?.click()
    }, 150)

    return () =>
      h('div', { class: 'app-workspace' }, [
        h('main', { class: 'showcase' }, [
          h('header', { class: 'showcase-head' }, [
            h('h1', '本轮改动呈现'),
            h('p', '2026-09-11 · AI 分析结论深化 + 结算单选择器改造（真实组件、真实结算单数据）'),
          ]),
          h(
            'section',
            { class: 'showcase-card' },
            [
              h('h2', '改了什么'),
              h(
                'ul',
                { class: 'showcase-list' },
                CHANGES.map(([title, text]) =>
                  h('li', [h('strong', title), h('span', text)]),
                ),
              ),
            ],
          ),
          h('section', { class: 'showcase-section' }, [
            h('h2', '① AI 结论：更醒目、更像结论'),
            h(AiAnalysisCard, {
              title: '号别小结',
              note: '按等级号别写成的白话结论；样本不足时只看这批货，只作参考',
              headings: GRADE_DETAIL_HEADINGS,
              resetKey: 'preview',
              canGenerate: true,
              run,
              generateText: '生成号别小结',
            }),
          ]),
          h('section', { class: 'showcase-section' }, [
            h('h2', '② 结算单选择：抽屉式选择器'),
            h('p', {
              class: 'showcase-note',
              innerHTML:
                '改动前：当前范围内<strong>所有结算单</strong>平铺在页面上，勾一下请求一次。' +
                '改动后：主页面只留已选摘要，搜索与勾选都在抽屉里，点「确定」才刷新。',
            }),
            h(SettlementPicker, {
              options: list.settlements,
              selected: selected.value,
              max: 6,
              loading: false,
              onApply: (value: string[]) => {
                selected.value = value
              },
            }),
          ]),
        ]),
      ])
  },
}

createApp(Showcase).mount('#app')
