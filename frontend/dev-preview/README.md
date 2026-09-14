# 视觉伴侣（dev-preview）

本地预览页面，用来在 53001 端口给业务方看真实组件、真实数据的效果。**不参与线上构建**，
只由本地 vite 开发服务器按 `/dev-preview/*.html` 直接访问。

## 启动

53001 是独立的 vite 实例（与 53000 的应用服务互不影响）：

```bash
npm --prefix frontend run dev -- --port 53001 --strictPort --host 0.0.0.0
```

打开 `http://127.0.0.1:53001/dev-preview/index.html` 是预览索引。

## 页面

| 文件 | 用途 |
| --- | --- |
| `index.html` | 预览索引 |
| `review-2026-09-11.html` | 本轮改动呈现（AI 结论醒目化 + 抽屉式选择器） |
| `grade-preview.html` | 「系列对比」真实页面（真实组件 + 真实结算单数据） |
| `grade-detail-design.html` | 等级细分视图的静态设计稿 |
| `mobile-review/index.html` | 手机端 6 个业务页面现状预览（截图与横向溢出/滚动指标） |

## 数据文件（已加入 `.gitignore`，必须本地保留才能打开预览）

- `fixture.json`：线上结算单与对比结果的真实返回
- `grade-detail-data.js`：等级细分设计稿用的真实号别数据
- `review-data.ts`：真实大模型结论文本

这些文件含真实经营数据，**禁止提交**；缺失时预览页会因为导入失败打不开，
从线上库重新导出即可。其余预览代码可以正常提交。
