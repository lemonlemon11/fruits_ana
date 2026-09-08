# fruits_ana

水果等级销售经营分析平台。

## 本地启动

后端使用 FastAPI 和 SQLite，默认数据库文件为
`backend/data/fruit_analysis.sqlite3`。在仓库根目录执行：

```powershell
cd backend
python -m uvicorn app.main:app --reload
```

健康检查地址：`http://127.0.0.1:8000/health`。

前端使用 Vue 3 和 Vite：

```powershell
cd frontend
npm install
npm run dev
```

当前基础路由包括 `/overview`、`/containers` 和 `/imports`。

