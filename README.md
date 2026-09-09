# 水果等级销售经营分析平台

面向管理者的水果等级销售工作台，重点比较 A/B/C 三类水果的销量、
销售额、加权均价和数量占比。原始 `BC` 等级统一计入 C，并在页面中显示为
“C 果（含 BC）”。回款、费用和清关数据仅用于解释单柜经营结果。

## 本地启动

后端使用 FastAPI 和 SQLite。首次运行会在
`backend/data/fruit_analysis.sqlite3` 创建本地数据库：

```powershell
cd backend
python -m uvicorn app.main:app --reload
```

健康检查：`http://127.0.0.1:8000/health`，接口文档：
`http://127.0.0.1:8000/docs`。

前端使用 Vue 3 和 Vite：

```powershell
cd frontend
npm install
npm run dev
```

默认前端地址为 `http://127.0.0.1:5173`。开发环境如需连接其他后端，设置
`VITE_API_BASE_URL`；未设置时使用同源 `/api`。

## 导入文件

- 支持 `.xlsx`、`.xls` 和 `.csv`，可一次上传多个文件。
- 通用表头可使用：柜号、销售日期、品种/规格、等级、数量、单价、金额。
- 兼容结算单中“柜号位于表头上方、日期合并或仅首行填写、等级写在品种规格中”的版式。
- 等级映射为 `A/A6 -> A`、`B/B6 -> B`、`C/C6/BC/BC6 -> C`。
- 缺字段或未知等级的行不会写入销售事实；其他有效行继续导入。
- 文件内容哈希相同会识别为重复导入，不产生重复销售记录。
- 原始上传文件和 SQLite 数据库都位于 `backend/data/`，该目录不会提交到 Git。

## 指标口径

- 销售数量：筛选范围内 `quantity` 之和。
- 销售金额：筛选范围内 `amount` 之和。
- 加权均价：销售金额 / 销售数量；数量为 0 时返回空值。
- 数量占比：某等级销售数量 / 同一筛选范围总销售数量。
- 日期筛选按销售日期计算，不按导入时间计算。

## 数据备份

停止后端服务后，备份整个 `backend/data/` 目录即可保留数据库和上传文件。
恢复时将备份放回相同位置。不要把该目录、真实结算单或其他业务附件提交到远程仓库。

## 验证

```powershell
cd backend
python -m pytest -q --basetemp=.pytest-tmp

cd ..\frontend
npm run build
```

## 已预留待办

用户后续会提供一份包含更细数据详情的表格。收到后需确认主键、柜号/日期关联键、
新增字段和重复数据规则，再扩展导入与分析；当前模型已保留 `spec_raw`、`remark`、
`sales_region`、批次 ID 和源文件 ID，首期不臆测该文件结构。

