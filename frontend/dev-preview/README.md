# 视觉伴侣（dev-preview）

本地预览页面，用来在 53001 端口给业务方看真实组件、真实数据的效果。**不参与线上构建**，
只由本地 vite 开发服务器按 `/dev-preview/*.html` 直接访问。

## 启动

53001 是独立的 vite 实例（与 53000 的应用服务互不影响）：

```bash
npm --prefix frontend run dev -- --port 53001 --strictPort --host 0.0.0.0
```

打开 `http://127.0.0.1:53001/dev-preview/index.html` 是预览索引。

「数据问答 Demo」需要走独立配置把 `/api` 代理到临时后端 8010（与上面命令不同）：

```bash
cd frontend && npx vite --config vite.demo.config.ts
```

后端为 `cd backend && ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010`，
两者都在 53001 / 8010 时，可打开 `http://127.0.0.1:53001/dev-preview/ask-demo.html`。

## 页面

| 文件 | 用途 |
| --- | --- |
| `redesign-20260922/index.html` | 全站布局重设计稿（手机 390 / 网页双端，登录 + 7 个菜单页 + 导入复核/手工录单流程页，虚构数据） |
| `index.html` | 预览索引 |
| `ask-demo.html` | 顺仔 · 悬浮问答机器人 Demo（右下角悬浮按钮 + 悬浮对话窗，`/api/ask`，53001 → 8010） |
| `review-2026-09-11.html` | 本轮改动呈现（AI 结论醒目化 + 抽屉式选择器） |
| `20260914-optimization-preview.html` | 2026-09-14 会议优化点展示稿（价格单位、等级扩展、日期全展示、取消价差/价比） |
| `settlement-picker-redesign.html` | 结算单选择交互改造稿（先选品牌，再选同品牌结算单；桌面 / 手机可切换） |
| `grade-preview.html` | 「系列对比」真实页面（真实组件 + 真实结算单数据） |
| `grade-detail-design.html` | 等级细分视图的静态设计稿 |
| `settlement-detail-taste.html` | 结算单详情页设计测试稿（用 taste skill 重新组织，数据为 mock 示例） |
| `settlement-detail-facts.html` | 结算单详情改造预览（基础信息条、规格级占比/总件数/均价，移除整单均价与销售金额排名） |
| `grade-breakdown-compact.html` | 等级图表紧凑版（饼图与均价横条并排、规格件数表全宽展开） |
| `mobile-review/index.html` | 手机端 6 个业务页面现状预览（截图与横向溢出/滚动指标） |

`ask-demo.html` 的样式拆成两份，方便整体移植到 `frontend/src`：

- `ask-widget.css`：悬浮组件本身（悬浮按钮 `.ask-fab` + 对话窗 `.ask-panel`），含与系统
  「回顶部」`.back-to-top` 的位置约定与层级约定；移植时整份拷过去即可
- `ask-mock-page.css`：演示页的页面外壳（页头 / 页签 / 卡片 / 占位内容 / 底部导航），只服务这份演示稿

## 数据文件（已加入 `.gitignore`，必须本地保留才能打开预览）

- `fixture.json`：线上结算单与对比结果的真实返回
- `grade-detail-data.js`：等级细分设计稿用的真实号别数据
- `review-data.ts`：真实大模型结论文本

这些文件含真实经营数据，**禁止提交**；缺失时预览页会因为导入失败打不开，
从线上库重新导出即可。其余预览代码可以正常提交。
