# SCF Redis 部署记录

> 知伴 C1 永久化存储 —— 把「社区飞轮」从 story 变 fact。
> 创建日期：2026-09-14

## 架构

```
用户 ── HTTPS ──▶ SCF（腾讯云函数 ap-beijing）── TCP:6379 ──▶ 云服务器 Redis
                              ↑
                    环境变量 STUCK_REDIS_URL
                       redis://:密码@120.53.25.165:6379/0
```

- **SCF 地址**：`https://1399201542-7y33vuteqi.ap-beijing.tencentscf.com`
- **Redis 服务器**：`zhihu.toply.top`（公网 IP 120.53.25.165）
- **运行机制**：`scf/stuck-store.js` 在 `STUCK_REDIS_URL` 有值时用 Redis 存储卡点数据；Redis 不可达时 5s 内自动降级进程内存，契约不变，永不 reject 悬挂。

## 安装配置步骤

### 1. 云服务器装 Redis（OpenCloudOS 9.4）

```bash
dnf install -y redis
# → redis-7.2.15-3.oc9.x86_64
```

### 2. 配置 Redis

```bash
# 绑定所有接口（公网可连）
sed -i 's/^bind 127.0.0.1 -::1$/bind 0.0.0.0 ::1/' /etc/redis/redis.conf

# 启用 AOF 持久化
sed -i 's/^appendonly no$/appendonly yes/' /etc/redis/redis.conf

# 设置密码
echo 'requirepass DCrKE2OnscbDMMAut+3zXEOI' >> /etc/redis/redis.conf

# 启动并设为开机自启
systemctl restart redis
systemctl enable redis
```

### 3. 防火墙放行 6379 端口

```bash
systemctl start firewalld
firewall-cmd --permanent --add-port=6379/tcp
firewall-cmd --reload
```

### 4. 验证本地连通

```bash
redis-cli -a 'DCrKE2OnscbDMMAut+3zXEOI' ping
# → PONG
```

### 5. SCF 环境变量配置

在腾讯云控制台 → 云函数 → 函数配置 → 环境变量，添加：

| 键 | 值 |
|---|---|
| `STUCK_REDIS_URL` | `redis://:DCrKE2OnscbDMMAut+3zXEOI@120.53.25.165:6379/0` |

> 密码不含特殊字符，无需 URL 编码。保存即生效，无需重新打包。

### 6. 线上探针验收

**探针 ID**：`article-probe-baseline`（独立探针，不打脏真实文章）

- `POST /stuck {"action":"report","articleId":"article-probe-baseline","concept":"__probe__","paragraphIndex":1}` → `{"ok":true,"concept":"__probe__","count":1}`
- `POST /stuck {"action":"top","articleId":"article-probe-baseline"}` → `{"items":[{"concept":"__probe__","count":1,"paragraphIndex":1}]}`
- 空闲 ≥150s 等待 SCF 实例回收后：
  `POST /stuck {"action":"top","articleId":"article-probe-baseline"}` → `{"items":[{"concept":"__probe__","count":1,"paragraphIndex":1}]}` ✅ **跨实例不丢**

## 密码安全

- Redis 密码：`DCrKE2OnscbDMMAut+3zXEOI`（随机生成，`openssl rand -base64 18`）
- 该密码同时存储在 SCF 环境变量 `STUCK_REDIS_URL` 中
- 如需修改密码，须同时更新 `/etc/redis/redis.conf` 的 `requirepass` 和 SCF 环境变量

## 故障排查

- 函数日志出现 `[stuck-store] Redis 不可用，后续降级内存：…` → 连接信息有误，检查 host/密码/网络连通性；服务正常降级内存不中断
- Redis 连不上但服务正常 → 降级内存模式，跨实例共享失效，需修复连接

## 相关文件

| 文件 | 用途 |
|---|---|
| `scf/stuck-store.js` | 存储适配层（Redis / 内存双引擎） |
| `scf/index.js` | SCF 入口，调用 stuck-store |
| `知伴_创意升级方案.md` | 整体方案追踪 |
| `README.md` | 部署说明（§8.1） |
