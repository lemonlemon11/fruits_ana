# 免登录品牌分析预览页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 未登录用户访问根路径或 `/preview` 时，直接看到宝贝系列 A/B/C 独立分析的只读演示页。

**Architecture:** 新增独立的 `PublicPreviewView.vue`，内置明确标注的演示数据和 SVG 图表，不调用后端 API。路由将 `/` 指向 `/preview`，`/preview` 不设 `requiresAuth`；现有业务页面继续沿用认证守卫。

**Tech Stack:** Vue 3、Vue Router、TypeScript、现有 CSS 变量与 SVG。

---

### Task 1: 创建公开预览页面

**Files:**
- Create: `frontend/src/views/PublicPreviewView.vue`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 添加演示数据与指标卡**
- [ ] **Step 2: 添加 A/B/C 趋势图、占比图、独立分析表和价差表**
- [ ] **Step 3: 添加登录真实数据入口与移动端布局**

### Task 2: 接入公开路由并验证

**Files:**
- Modify: `frontend/src/main.ts`
- Modify: `frontend/tests/sfc-build-entry.ts`

- [ ] **Step 1: 根路径重定向到 `/preview`，公开路由不触发认证守卫**
- [ ] **Step 2: 运行构建并请求首页、预览页**
- [ ] **Step 3: 确认受保护路由仍跳转登录**

