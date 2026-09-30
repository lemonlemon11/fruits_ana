# 现场 Docker 部署

本目录用于在已安装独立 MySQL 的现场服务器上用 Docker Compose 部署用户端 `fruits_ana`
（后端 + Nginx 前端两个容器）：`http://现场IP:53000`。

本仓库只管理 fruits_ana 自己的服务；管理端 `fruits_ana_admin` 的部署由其自身仓库的
`deploy/` 目录独立管理，不在此处编排。

容器使用 `network_mode: host`，直接访问宿主机 `127.0.0.1:3306` 上的 MySQL。

## 前置条件

- Linux 宿主机已安装 Docker Engine 与 Compose v2。
- 同机已安装 MySQL，并已创建 `fruits_ana` 数据库及专用账号。
- 宿主机端口 `53000`、`8000` 未被占用。

## 1. 准备环境变量

```bash
cd deploy/docker
cp .env.docker.example .env.docker
```

编辑 `.env.docker`，至少修改：

- `FRUIT_ANALYSIS_DATABASE_URL` 中的账号、密码、数据库名。
- `FRUIT_ANALYSIS_AI_*`，如现场不需要 AI 可留空。

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

历史上传原件位于 `fruits_ana/backend/data/uploads`。启动后上传原件与日志直接落在
宿主机目录（见下方「数据持久化」），首次部署如需保留原文件，先把旧目录内容拷入
`deploy/docker/data/uploads/`。

## 3. 构建并启动

```bash
cd deploy/docker
docker compose build
docker compose up -d
```

服务按以下顺序启动：`fruits-backend` 健康检查通过后再启动 `fruits-web`。

## 4. 验证

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:53000/
docker compose ps
```

## 常用运维

```bash
docker compose logs -f
docker compose restart
docker compose down
```

## 数据持久化（宿主机目录映射）

上传原件与运行日志通过 bind mount 直接落在宿主机，目录相对于本 compose 文件：

- `deploy/docker/data/uploads/` ← 容器 `/app/backend/data/uploads`（用户上传的 xlsx 原件）
- `deploy/docker/data/logs/` ← 容器 `/app/backend/data/logs`（`fruits_ana.log` 及轮转备份）

说明：

- 容器以 root 运行，这两个目录下的文件属主为 root，宿主机查看 / 备份需 `sudo`。
- `docker compose down` 乃至 `down -v` 都**不会**影响这两个目录；清空数据需手动删除
  `deploy/docker/data/`，操作前务必确认已备份。
- 如需把数据放到别的位置（如独立数据盘），先设置环境变量再执行 compose 命令：

  ```bash
  export FRUITS_DATA_DIR=/opt/fruits_ana/data
  docker compose up -d
  ```

  注意：`FRUITS_DATA_DIR` 只能通过 shell 环境变量传入；写进 `.env.docker` 无效
  （该文件只注入容器内部环境变量，不参与 compose 挂载路径解析）。

### 从旧版命名卷迁移

2026-09-30 之前的 compose 用命名卷 `fruits_uploads` 保存上传原件。旧部署升级后如需
找回卷内数据，执行（在 `deploy/docker/` 目录下）：

```bash
docker run --rm \
  -v fruits-ana_fruits_uploads:/from \
  -v "$(pwd)/data/uploads":/to \
  alpine cp -a /from/. /to/
```

