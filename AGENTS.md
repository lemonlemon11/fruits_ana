# AGENTS.md — SLD-水果市场销售分析

> 本文件是 `fruits_ana` 仓库的项目级规则，也是**跨模型交接的入口文件**。
> 所有在此仓库工作的 AI Agent / Codex 都必须先读本文件。
> 与全局 `~/.codex/AGENTS.md` 冲突时，以本文件为准。

## Project

- 项目名称：SLD-水果市场销售分析（仓库目录 fruits_ana）
- 项目目标：面向果农的水果销售分析工具，围绕 A/B/C 三级的销量、销售额、加权均价、
  数量占比，提供「导入 → 看板 → 单柜诊断 → 货柜对比」的完整链路；原始 `BC` 等级统一
  归入 C，界面显示为「C 果（含 BC）」。回款、费用、清关数据只用于解释单柜经营结果。
- 主要技术栈：
  - Language：Python 3.11+ / TypeScript 5.6
  - Backend：FastAPI + SQLAlchemy 2.0 + Uvicorn，入口 `backend/app/main.py`
  - Database：MySQL（PyMySQL 驱动），连接配置见 `backend/.env.example`
  - Frontend：Vue 3 + Vue Router + Vite，无状态管理库、无完整 UI 组件库
    （`SearchableSelect` / `DateRangeFilter` 内部试点 Element Plus）
  - Charts：ECharts（`frontend/src/components/BaseEChart.vue` 统一封装；图表组件保留现有 props）
  - Test：pytest（后端）/ `node:test` + `--experimental-strip-types`（前端）
  - Deployment：本地同机启动前后端，见 `start.sh`；暂无容器化 / CI

## 目录结构

```text
fruits_ana/
├── AGENTS.md              # 本文件：项目规则与交接入口
├── README.md              # 面向使用者的启动 / 导入 / 指标口径说明
├── docs/
│   ├── ARCHITECTURE.md    # 系统结构与数据流
│   ├── DECISIONS.md       # 架构决策记录（ADR）
│   ├── HANDOFF.md         # 模型交接状态（切换模型必读必写）
│   ├── TODO.md            # 分级待办
│   └── superpowers/       # 历史 spec 与 plan（按日期归档，不要重写）
├── design/                # 早期设计文档与关键决策记录（历史资料）
├── scripts/handoff.sh     # 交接信息采集脚本
├── backend/
│   ├── app/               # api / services / parser / models / schemas / auth / db
│   ├── scripts/           # 一次性数据迁移脚本
│   └── tests/             # pytest 用例
└── frontend/
    ├── src/               # views / components / api / utils / styles-*.css
    └── tests/             # node:test 用例
```

## 开始工作前必须完成

在修改任何代码之前，按顺序完成：

1. 阅读本文件
2. 阅读 `docs/ARCHITECTURE.md`
3. 阅读 `docs/HANDOFF.md`（重点看 In Progress / Next Steps / Do Not Change）
4. 阅读 `docs/TODO.md`
5. 执行 `git status`
6. 执行 `git diff`（确认是否存在未提交的在途改动）
7. 执行 `git log --oneline -10`
8. 阅读 `docs/HANDOFF.md` 中 Relevant Files 列出的关键文件

未完成上述检查，不得修改代码。若是接手其他模型的在途任务，先复述
「当前架构 / 当前任务 / 已完成 / 未完成 / 已知问题 / 下一步」并等待确认。

## 开发规则

1. 优先扩展现有实现，不新建重复架构或平行目录
2. 不改变已有 API 行为，除非任务明确要求（接口契约变更需同步 `frontend/src/api/types.ts`）
3. 不删除用途不明的代码
4. 不修改生产 / 数据库配置，除非任务明确要求
5. 不提交密钥、Token、密码；`.env`、`backend/.env` 已被 Git 忽略，禁止强行加入
6. 不随意引入新依赖；新增依赖需说明理由，并同步 `backend/pyproject.toml` 或 `frontend/package.json`
7. 大型重构前必须先说明影响范围并等待确认
8. 数据口径变更（等级映射、指标公式、去重规则）必须记入 `docs/DECISIONS.md`

## 验证命令

```bash
# 后端测试（当前 236 项）
.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp

# 前端测试（当前 120 项）
npm --prefix frontend run test

# 前端类型检查与构建
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

- 前端暂无 `npm run lint` 脚本；以 `test` + `typecheck` + `build` 为准。
- 若某项无法运行，必须在 `docs/HANDOFF.md` 的 Test Status 中注明原因，不得默认「通过」。
- 未提供验证证据时，不得声称「完成 / 可提交 / 可合并」。

## Git 规则

禁止使用（除非用户明确要求）：

- `git reset --hard`
- `git clean -fd`
- `git push --force`

重要阶段完成后创建 checkpoint commit，格式：`checkpoint: <英文短描述>`。
常规提交遵循 `<type>(scope): <中文摘要>`；`summary` 动词开头、≤ 50 字、不加句号。

## 开发工作量登记（每次开发必写）

- 适用范围：任何涉及开发的工作——新功能、bug 修复、重构、前后端代码改动、配置 / 依赖 /
  环境模板 / 数据库 / schema / 共享类型变更、测试与文档变更——无论大小，都必须登记。
- 必写位置：每次会话结束时，在 `docs/HANDOFF.md` 顶部按日期追加一条本次变更记录；同时在
  `docs/TODO.md` 留档完成项（新增待办则写“进行中”，完成后改为“已完成”）。
- 记录最小包含：日期、一句话变更摘要、涉及的文件、验证结果（或无法验证的原因）。
- 若产生架构决策或数据口径变更，同步 `docs/DECISIONS.md`；系统结构 / 模块职责变化同步
  `docs/ARCHITECTURE.md`。
- 该规则优先于全局“轻量任务不强制生成文档”的默认策略：轻量任务也必须写一条简短
  HANDOFF 记录，但不要求另建 spec / plan。
- 目的是支撑后续工作量统计与模型交接；不允许只把改动留在对话上下文或 `git diff` 里。

## 上下文持久化与模型交接

项目状态必须落在文件与 Git 中，不允许只存在于某个模型的上下文里。每完成一个重要阶段：

| 触发条件 | 必须更新 |
| --- | --- |
| 一个阶段结束 / 准备切换模型 | `docs/HANDOFF.md`、`docs/TODO.md` |
| 产生架构决策 | `docs/DECISIONS.md` |
| 系统结构、模块职责发生变化 | `docs/ARCHITECTURE.md` |
| 启动方式、验证命令、依赖变化 | 本文件 `AGENTS.md`、`README.md` |

交接流程：

1. 切换前执行 `./scripts/handoff.sh` 采集当前 Git 状态
2. 更新 `HANDOFF.md` / `TODO.md`，必要时更新 `DECISIONS.md` / `ARCHITECTURE.md`
3. 运行当前可运行的验证并如实记录结果
4. 新建 checkpoint commit：`git commit -m "checkpoint: model handoff"`
5. 新模型接手时先只读复述状态，确认后再改代码
