<script setup lang="ts">
import Boxes from '@lucide/vue/dist/esm/icons/boxes.mjs'
import ChartColumn from '@lucide/vue/dist/esm/icons/chart-column.mjs'
import GitCompareArrows from '@lucide/vue/dist/esm/icons/git-compare-arrows.mjs'
import LogOut from '@lucide/vue/dist/esm/icons/log-out.mjs'
import PackageSearch from '@lucide/vue/dist/esm/icons/package-search.mjs'
import Table2 from '@lucide/vue/dist/esm/icons/table-2.mjs'
import Upload from '@lucide/vue/dist/esm/icons/upload.mjs'
import X from '@lucide/vue/dist/esm/icons/x.mjs'
import { computed, ref } from 'vue'

import BrandMark from '../src/components/BrandMark.vue'

/** 原型：顶部 header（右侧用户名 + 退出登录）+ 页签栏 + 内容区。 */
interface NavItem {
  path: string
  label: string
  icon: unknown
  summary: string
}

const HOME_PATH = '/overview'

const primaryNav: NavItem[] = [
  { path: '/overview', label: '卖得怎么样', icon: ChartColumn, summary: '本期的件数、金额和平均每件售价总览' },
  { path: '/settlements', label: '每一单', icon: Table2, summary: '按结算单逐单查看 A / B / C 明细' },
  { path: '/imports', label: '数据导入', icon: Upload, summary: '导入结算单，自动做数据质量检查' },
]

const moreNav: NavItem[] = [
  { path: '/settlement-detail', label: '结算单详情', icon: PackageSearch, summary: '单张结算单的进货、销售与费用结构' },
  { path: '/settlement-comparison', label: '结算单对比', icon: GitCompareArrows, summary: '两张结算单并排比较等级与价差' },
  { path: '/series-comparison', label: '系列对比', icon: Boxes, summary: '按系列或按等级号别对比，并给出 AI 小结' },
]

const navItems = [...primaryNav, ...moreNav]
const userName = '王老板'
const pendingNavOpen = ref(false)

// 页签 = 已打开且未关闭的页面；首页固定不可关闭。
const opened = ref<string[]>([HOME_PATH, '/series-comparison', '/settlements'])
const activePath = ref(HOME_PATH)

const activeItem = computed(
  () => navItems.find((item) => item.path === activePath.value) ?? navItems[0],
)
const openedItems = computed(() =>
  opened.value
    .map((path) => navItems.find((item) => item.path === path))
    .filter((item): item is NavItem => Boolean(item)),
)

function isClosable(path: string): boolean {
  return path !== HOME_PATH
}

/** 点导航或内容里的链接：已打开就激活，没打开就新增一个页签。 */
function openPage(path: string) {
  if (!opened.value.includes(path)) opened.value.push(path)
  activePath.value = path
  pendingNavOpen.value = false
}

/** 关闭页签：关掉当前页时跳到它右边那个，没有右边就跳左边。 */
function closePage(path: string) {
  if (!isClosable(path)) return
  const index = opened.value.indexOf(path)
  if (index < 0) return
  opened.value.splice(index, 1)
  if (activePath.value === path) {
    activePath.value = opened.value[Math.min(index, opened.value.length - 1)] ?? ''
  }
}

function closeOthers() {
  opened.value = opened.value.filter((path) => !isClosable(path) || path === activePath.value)
}

const statCards = [
  { label: '总件数', value: '3 821 件', note: '4 张结算单' },
  { label: '总金额', value: '1 654 520 元', note: '平均每件 433.01 元' },
  { label: 'A 果占比', value: '29.4%', note: '金额占比 35.2%' },
]
</script>

<template>
  <div class="proto-shell">
    <header class="proto-header">
      <div class="proto-brand">
        <BrandMark :size="34" />
        <div class="proto-brand-copy">
          <strong>SLD-水果市场销售分析</strong>
          <span>果农版</span>
        </div>
      </div>
      <div class="proto-account">
        <span class="proto-avatar" aria-hidden="true">{{ userName.slice(0, 1) }}</span>
        <span class="proto-username">{{ userName }}</span>
        <button type="button" class="proto-sign-out">
          <LogOut :size="18" aria-hidden="true" />
          <span>退出登录</span>
        </button>
      </div>
    </header>

    <div class="proto-body">
      <aside class="proto-sidebar" aria-label="主要导航">
        <nav>
          <button
            v-for="item in primaryNav"
            :key="item.path"
            type="button"
            :class="{ 'is-active': activePath === item.path }"
            @click="openPage(item.path)"
          >
            <component :is="item.icon" :size="20" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
          <p class="proto-nav-label">更多功能</p>
          <button
            v-for="item in moreNav"
            :key="item.path"
            type="button"
            class="is-secondary"
            :class="{ 'is-active': activePath === item.path }"
            @click="openPage(item.path)"
          >
            <component :is="item.icon" :size="20" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </aside>

      <div class="proto-workspace">
        <div class="proto-tabs" role="tablist" aria-label="已打开的页面">
          <div class="proto-tabs-scroll">
            <span
              v-for="item in openedItems"
              :key="item.path"
              class="proto-tab"
              :class="{ 'is-active': activePath === item.path }"
            >
              <button type="button" role="tab" :aria-selected="activePath === item.path" @click="openPage(item.path)">
                <component :is="item.icon" :size="16" aria-hidden="true" />
                <span>{{ item.label }}</span>
              </button>
              <button
                v-if="isClosable(item.path)"
                type="button"
                class="proto-tab-close"
                :aria-label="`关闭 ${item.label}`"
                @click="closePage(item.path)"
              >
                <X :size="14" aria-hidden="true" />
              </button>
            </span>
          </div>
          <button v-if="openedItems.length > 1" type="button" class="proto-tabs-action" @click="closeOthers">
            关闭其他
          </button>
        </div>

        <main class="proto-content" aria-live="polite">
          <header class="proto-page-head">
            <div>
              <h1>{{ activeItem.label }}</h1>
              <p>{{ activeItem.summary }}</p>
            </div>
          </header>
          <div class="proto-cards">
            <article v-for="card in statCards" :key="card.label">
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
              <small>{{ card.note }}</small>
            </article>
          </div>
          <div class="proto-placeholder">
            <strong>这里放真实页面内容</strong>
            <span>页签只负责记录「打开了哪些页面」；切换页签不会丢失已打开页面的位置。</span>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.proto-shell { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 100vh; background: var(--bg, #f4f7f4); }
.proto-header {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-height: 62px; padding: 0 20px;
  border-bottom: 1px solid var(--line); background: var(--surface);
}
.proto-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.proto-brand-copy { display: grid; min-width: 0; }
.proto-brand-copy strong { font-size: 1rem; }
.proto-brand-copy span { color: var(--muted); font-size: .82rem; }
.proto-account { display: flex; align-items: center; gap: 10px; }
.proto-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--primary-soft); color: var(--primary-dark); font-weight: 700;
}
.proto-username { font-weight: 700; }
.proto-sign-out {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 44px; padding: 0 14px;
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--ink); font-size: .95rem; cursor: pointer;
}
.proto-sign-out:hover { border-color: var(--warning); color: var(--warning); }

.proto-body { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 0; }
.proto-sidebar { border-right: 1px solid var(--line); background: var(--surface); padding: 12px; }
.proto-sidebar nav { display: grid; gap: 6px; }
.proto-sidebar button {
  display: flex; align-items: center; gap: 10px;
  min-height: 48px; padding: 0 12px; width: 100%;
  border: 1px solid transparent; border-radius: var(--radius-sm);
  background: transparent; color: var(--ink); font-size: 1rem; text-align: left; cursor: pointer;
}
.proto-sidebar button:hover { background: var(--surface-soft); }
.proto-sidebar button.is-active { border-color: var(--primary-dark); background: var(--primary); color: white; }
.proto-sidebar button.is-secondary { color: var(--muted); }
.proto-sidebar button.is-secondary.is-active { border-color: var(--line-strong); background: var(--surface-soft); color: var(--ink); }
.proto-nav-label { margin: 12px 0 2px; padding-left: 12px; color: var(--muted); font-size: .88rem; font-weight: 700; }

.proto-workspace { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; }
.proto-tabs {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; border-bottom: 1px solid var(--line); background: var(--surface);
}
.proto-tabs-scroll { display: flex; gap: 6px; overflow-x: auto; min-width: 0; }
.proto-tab {
  display: inline-flex; align-items: center; flex: 0 0 auto;
  border: 1px solid var(--line); border-radius: 999px; background: var(--surface-soft);
}
.proto-tab.is-active { border-color: var(--primary); background: color-mix(in srgb, var(--primary-soft) 60%, white); }
.proto-tab > button[role='tab'] {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 38px; padding: 0 10px 0 12px;
  border: 0; background: transparent; color: var(--ink); font-size: .92rem; cursor: pointer;
}
.proto-tab.is-active > button[role='tab'] { font-weight: 700; color: var(--primary-dark); }
.proto-tab-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; margin-right: 4px; padding: 0;
  border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer;
}
.proto-tab-close:hover { background: var(--primary-soft); color: var(--primary-dark); }
.proto-tabs-action {
  flex: 0 0 auto; min-height: 36px; padding: 0 10px;
  border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--muted); font-size: .88rem; cursor: pointer;
}

.proto-content { min-width: 0; overflow-y: auto; padding: 20px; display: grid; gap: 16px; align-content: start; }
.proto-page-head h1 { margin: 0 0 4px; font-size: 1.35rem; }
.proto-page-head p { margin: 0; color: var(--muted); }
.proto-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.proto-cards article {
  display: grid; gap: 4px; padding: 14px 16px;
  border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface);
}
.proto-cards span { color: var(--muted); font-size: .9rem; }
.proto-cards strong { font-size: 1.3rem; font-variant-numeric: tabular-nums; }
.proto-cards small { color: var(--muted); }
.proto-placeholder {
  display: grid; gap: 6px; padding: 24px;
  border: 1px dashed var(--line-strong); border-radius: var(--radius-sm);
  background: var(--surface-soft); text-align: center;
}
.proto-placeholder span { color: var(--muted); }

@media (max-width: 820px) {
  /* 移动端 header 收成一行：只留品牌图标 + 头像 + 退出登录，避免挤成两行。 */
  .proto-header { flex-wrap: nowrap; gap: 8px; min-height: 56px; padding: 0 12px; }
  .proto-brand-copy { display: none; }
  .proto-username { display: none; }
  .proto-sign-out { padding: 0 12px; }
  .proto-body { grid-template-columns: minmax(0, 1fr); }
  .proto-sidebar { display: none; }
  .proto-content { padding: 14px; }
}
</style>
