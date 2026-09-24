# 手机版设计稿（2026-09-20 ~ 09-21）

在 53001 给业务方看的一轮手机版改版结果：12 个页面的整页长图 + 设计规范说明。

打开：`http://127.0.0.1:53001/dev-preview/mobile-20260920/index.html`
（53001 是独立的 vite 实例，见 `../README.md`）

## 截图怎么来的

截图取自 **53000 真实前端**（不是 mock）：390×844 视口、2x 像素密度、真实 MySQL 数据。

```bash
# 11 张登录态 / 免登录页面（其余 png 由这两个脚本产出）
PREVIEW_USER=<账号> PREVIEW_PASS=<密码> \
PLAYWRIGHT_PATH=<playwright 入口> \
node frontend/dev-preview/mobile-20260920/capture-mobile.mjs

# 单独补一张「多文件上传队列」（需要真实选文件才能触发）
PREVIEW_USER=<账号> PREVIEW_PASS=<密码> \
PLAYWRIGHT_PATH=<playwright 入口> \
node frontend/dev-preview/mobile-20260920/capture-import-queue.mjs
```

前置：53000 与 `127.0.0.1:8000` 都在运行；`CHROME_PATH` 可覆盖 Chromium 路径。
账号密码走环境变量，不写进脚本。

## 两个约定（避免看图误解）

- **底部导航**：整页长图里固定定位元素会被画在「视口底部」那个位置（整页看就是页面中间），
  所以脚本先把 `.mobile-tabbar` 改钉到文档底部。
- **悬浮按钮**：「顺仔」入口与「回顶部」是视口锚定的，在整页长图里没有意义，
  而且它们的负偏移会把截图撑宽（390 → 402），因此长图里已隐藏。

另有 `entry-expanded.png` / `import-review*.png` 为局部截图（展开态、二次确认页），
由临时脚本单独产出，未纳入本目录脚本。

## 不在本轮范围

`/preview`（公开演示页）的等级对比表仍是横向滚动表格，属该页独立设计语言，未纳入应用内
`styles-mobile.css` 这套样式。
