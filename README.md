# SLD-水果市场销售分析

面向果农的简明水果销售分析工具，重点查看各等级水果的销量、
销售额、平均每千克售价和数量占比。原始 `BC` 等级统一计入 C，并在页面中显示为
“C 果（含 BC）”。结算单以商号（我司商业合同唯一单据号）为身份，柜号仅作为车柜标识；
回款、费用和清关数据用于解释结算单的经营结果。

## 本地启动

后端使用 FastAPI、SQLAlchemy 和 MySQL。先在项目根目录安装依赖：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm --prefix frontend ci
```

复制 `backend/.env.example` 为 `backend/.env`，统一填写 MySQL 与 AI 大模型配置。
`.env` 已被 Git 忽略，也可以直接通过系统环境变量提供同名配置。若设置
`FRUIT_ANALYSIS_DATABASE_URL`，它的优先级高于各项 `FRUIT_ANALYSIS_DB_*` 配置。

然后使用脚本同时启动前后端：

```bash
./start.sh
```

网页地址为 `http://127.0.0.1:53000`。后端健康检查为
`http://127.0.0.1:8000/health`，接口文档为 `http://127.0.0.1:8000/docs`。
`start.sh` 默认使用 Nginx 生产模式：先构建前端到 `frontend/dist`，再由 Nginx 监听
`53000` 提供静态页面，并把 `/api` 反向代理到 `127.0.0.1:8000`。后端只监听本机，
不对公网暴露。首次部署需先安装 `deploy/fruits_ana.nginx.conf`：

```bash
mkdir -p /www/server/panel/vhost/nginx
ln -sf "$PWD/deploy/fruits_ana.nginx.conf" /www/server/panel/vhost/nginx/fruits_ana.conf
nginx -t
systemctl reload nginx
./start.sh
```

如需前端热更新，使用 `FRONTEND_MODE=dev ./start.sh`；只想本地验证构建产物而不使用
Nginx，可使用 `FRONTEND_MODE=preview ./start.sh`。

也可以分别启动服务：

```bash
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
npm --prefix frontend run dev -- --host 0.0.0.0 --port 53000 --strictPort
```

启动脚本支持通过 `BACKEND_HOST`、`BACKEND_PORT`、`FRONTEND_HOST` 和
`FRONTEND_PORT` 覆盖默认监听地址及端口。前端开发环境使用同源 `/api`，由 Vite
代理到 `http://127.0.0.1:8000`。

## 导入文件

- 支持 `.xlsx` 和 `.csv`，可一次上传多个文件。
- Excel 结算单从表头上方读取「商号 / 单号 / 柜号 / 转运车号」，CSV 则从同名列读取。
- 通用表头可使用：商号、单号、柜号、销售日期、品种/规格、等级、数量、单价、金额。
- 兼容结算单中“元数据位于表头上方、日期合并或仅首行填写、等级写在品种规格中”的版式。
- 等级映射为 `A/A6 -> A`、`B/B6 -> B`、`C/C6/BC/BC6 -> C`。
- 缺字段或未知等级的行不会写入销售事实；其他有效行继续导入。
- 商号缺失的文件会被拒绝；同一商号再次上传返回「已存在」，确认覆盖后才会替换原有结算单。
- 上传期间页面会显示等待遮罩和“正在导入，请稍候”，按钮同时禁用，避免重复提交或误操作。
- 单号展示：填写人员写法不统一（`宝贝01` / `宝贝003` / `宝贝L004`），系统会同时保存
  **原始单号**与**适配后单号**（`宝贝-001` / `宝贝-003` / `宝贝-004`），页面、导出与
  导入记录统一展示适配后的写法；原始写法保留在库里，可在明细列与导入记录副标题中查看。
  适配规则里序号只保留数字：`宝贝L004` 的 `L` 是填写习惯、不是编号的一部分，去掉后为 `宝贝-004`。
- 商号展示：填写人员有时会在商号前多加一个「单」字（`单637` / `单624`），系统会同时保存
  **原始商号**与**适配后商号**（`637` / `624`），页面、导出与 AI 数据包统一展示适配后的写法；
  原始写法保留在库里，可在明细列 tooltip 中查看。**商号是结算单唯一键与查询参数，
  取值始终使用原始商号**，只有展示走适配后商号。
- 原始上传文件位于 `backend/data/uploads/`，业务数据保存在 MySQL；这些文件均不会提交到 Git。

## 指标口径

- 销售数量：筛选范围内 `quantity` 之和。
- 销售金额：筛选范围内 `amount` 之和。
- 平均每千克售价：销售金额 / 销售数量；数量为 0 时返回空值。
- 数量占比：某等级销售数量 / 同一筛选范围总销售数量。
- 日期筛选按销售日期计算，不按导入时间计算。

## SQLite 数据迁移

确认目标 MySQL 业务表为空后，在项目根目录执行：

```bash
.venv/bin/python -m scripts.migrate_sqlite_to_mysql
```

迁移工具读取 `backend/data/fruit_analysis.sqlite3`，自动创建 MySQL 表并按外键顺序
复制数据，最后校验每张表的行数。若目标库已有业务数据会直接停止，不会覆盖。

## 认证表结构变更

注册已取消邮箱字段，登录改用“用户名 + 密码”，`user` 表以 `display_name` 作为唯一用户名。
登录默认保持 7 天；勾选“30 天内免登录”后，服务端会话与 HttpOnly Cookie 同步延长到 30 天。
已建库的环境执行一次幂等迁移（会删除 `user.email` 列及其唯一索引；存在忽略大小写的重名用户时拒绝执行）：

```bash
.venv/bin/python -m scripts.migrate_user_to_username
```

## 页面操作

- 工作台右上角 header 显示当前本地日期、星期和时分秒，手机端只显示时分秒以节省空间。
- 业务页面向下滚动超过约 320px 后，右下角会显示“回顶部”悬浮按钮；手机端按钮自动抬到底部导航上方。
- 手机端使用顶部 header + 底部大按钮导航，底部导航常驻三个主入口，更多功能收进“更多”面板。
- 已打开页面使用顶部页签管理，首页固定不可关闭；右键页签可刷新当前、关闭当前、关闭其他或关闭全部。
- header 铃铛集中展示站内通知，未读消息以角标和侧边小方块提示；点击消息可在详情弹层中查看完整内容。

## 数据备份

MySQL 数据应使用服务端备份策略，也可手动导出：

```bash
mysqldump -h <host> -P <port> -u <user> -p fruits_ana > fruits_ana.sql
```

`backend/data/uploads/` 仍需单独备份；迁移完成后建议暂时保留原 SQLite 文件作为
只读回滚快照。不要把数据库导出、真实结算单或其他业务附件提交到远程仓库。

## 验证

```bash
.venv/bin/python -m pytest backend/tests -q --basetemp=backend/.pytest-tmp
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

## 已预留待办

用户后续会提供一份包含更细数据详情的表格。收到后需确认主键、商号/日期关联键、
新增字段和重复数据规则，再扩展导入与分析；当前模型已保留 `spec_raw`、`remark`、
`sales_region`、批次 ID 和源文件 ID，首期不臆测该文件结构。
