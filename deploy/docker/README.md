# 现场 Docker 部署

本目录用于在已安装独立 MySQL 的现场服务器上用 Docker Compose 部署两个应用：

- 用户端 `fruits_ana`：`http://现场IP:53000`
- 管理端 `fruits_ana_admin`：`http://现场IP:54000`

容器使用 `network_mode: host`，直接访问宿主机 `127.0.0.1:3306` 上的 MySQL。

## 前置条件

- Linux 宿主机已安装 Docker Engine 与 Compose v2。
- 同机已安装 MySQL，并已创建 `fruits_ana` 数据库及专用账号。
- 宿主机端口 `53000`、`54000`、`8000`、`8001` 未被占用。

## 1. 准备环境变量

```bash
cd deploy/docker
cp .env.docker.example .env.docker
```

编辑 `.env.docker`，至少修改：

- `FRUIT_ANALYSIS_DATABASE_URL` 中的账号、密码、数据库名。
- `FRUIT_ANALYSIS_AI_*`，如现场不需要 AI 可留空。
- `FRUIT_ADMIN_CORS_ORIGINS`，改成现场实际访问地址。

## 2. 初始化 MySQL

```sql
CREATE DATABASE fruits_ana DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fruits_user'@'localhost' IDENTIFIED BY 'CHANGE_ME';
GRANT ALL PRIVILEGES ON fruits_ana.* TO 'fruits_user'@'localhost';
FLUSH PRIVILEGES;
```

如需从旧环境迁移数据，在启动容器前导入：

```bash
mysqldump --single-transaction --routines --triggers \
  --set-gtid-purged=OFF -h 旧库地址 -u root -p fruits_ana > fruits_ana.sql

mysql -h 127.0.0.1 -u root -p fruits_ana < fruits_ana.sql
```

历史上传原件位于 `fruits_ana/backend/data/uploads`，迁移后由 Docker volume
`fruits_uploads` 持久化；若现场需要保留原文件，可先备份原目录。

## 3. 构建并启动

```bash
cd deploy/docker
docker compose build
docker compose up -d
```

服务按以下顺序启动：`fruits-backend` 健康后启动 `admin-backend`，再启动两个 Web 容器。

## 4. 验证

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8001/health
curl http://127.0.0.1:53000/
curl http://127.0.0.1:54000/
docker compose ps
```

## 常用运维

```bash
docker compose logs -f
docker compose restart
docker compose down
```

`docker compose down` 默认不会删除 `fruits_uploads` volume；如需清空请谨慎执行：

```bash
docker compose down -v
```
