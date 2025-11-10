<div align="center">

# Claude Code Hub

**🚀 企业级 AI API 代理中转服务平台**

专为需要统一管理多个 AI 服务提供商的团队和企业设计

[![License](https://img.shields.io/github/license/gaoziman/claude-code-hub-new)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/gaoziman/claude-code-hub-new)](https://github.com/gaoziman/claude-code-hub-new/stargazers)
[![GitHub Release](https://img.shields.io/github/v/release/gaoziman/claude-code-hub-new)](https://github.com/gaoziman/claude-code-hub-new/releases)

</div>

> **💡 致谢**
>
> 本项目基于 [ding113/claude-code-hub](https://github.com/ding113/claude-code-hub) 进行增强开发。
> 感谢原作者 [@zsio](https://github.com/zsio) 和 [@ding113](https://github.com/ding113) 的开源贡献！

> **💬 加入交流群**
>
> 欢迎加入微信交流群讨论项目使用、功能建议和技术问题
> 微信号：`leocoder_gcoder`

---

## ✨ 功能特性

### 🎯 核心能力

- **🔄 统一代理** - 一个 API 接口管理所有 AI 服务提供商（Claude、OpenAI、Gemini 等）
- **⚖️ 智能负载** - 基于权重 + 优先级的智能分发 + 自动故障转移 + 会话保持
- **👥 多租户** - 完整的用户体系，细粒度权限控制和配额管理
- **🔑 密钥管理** - API Key 生成、轮换、过期管理、使用限制
- **📊 实时监控** - 请求统计、成本追踪、性能分析、可视化报表
- **🎨 现代 UI** - 基于 Shadcn UI 的响应式管理面板，支持深色模式
- **🚀 生产就绪** - Docker 一键部署、自动数据库迁移、健康检查

### 🚀 本版本增强功能

基于 [ding113/claude-code-hub](https://github.com/ding113/claude-code-hub) 进行了以下增强：

#### 🆕 v1.0.1 新增

- **🔄 熔断器 Redis 持久化** ⭐
  - 熔断器状态在 Redis 中持久化存储
  - 支持多实例环境下的熔断器状态共享
  - 应用重启后自动恢复熔断器健康状态

- **🔧 系统稳定性提升**
  - 修复客户端组件对服务端模块的依赖问题
  - 添加 server-only 包保护，防止客户端意外引用服务端模块

#### 📦 核心特性

- **🌐 代理支持** - 供应商级别的代理配置（HTTP/HTTPS/SOCKS4/SOCKS5）
  - 支持认证代理
  - 故障降级到直连
  - 连接测试工具

- **🔀 模型重定向** - 将 Claude 模型请求重定向到任意第三方 AI
  - 客户端无需修改配置
  - 灵活接入智谱、Google、OpenAI 等服务
  - 保持用户端计费透明

- **📚 API 文档自动化** - OpenAPI 3.1.0 规范
  - 39 个 REST API 端点
  - Swagger UI + Scalar UI 双界面
  - 交互式 API 测试

- **📄 价格表分页查询** - 大规模数据性能优化
  - SQL 层面分页查询
  - 搜索防抖（500ms）
  - 支持 20/50/100/200 条/页

- **📋 详细日志记录** - 完整的请求日志
  - Token 使用量（含缓存 Token）
  - 成本计算
  - 决策链追踪

- **🔒 并发控制** - 用户和供应商级别的并发限制
  - Session 级别并发追踪
  - Redis 原子性操作

- **⏱️ 多时段限流** - 灵活的配额管理
  - 5小时/周/月 三个时间窗口
  - 金额限流 + RPM 限流
  - 用户/密钥/供应商多维度限制

- **🛡️ 熔断保护** - 供应商故障自动熔断
  - 状态机：Closed → Open → Half-Open
  - 失败阈值可配置（默认 5 次）
  - 熔断时长可配置（默认 30 分钟）

- **📈 统计排行榜** - 日/月统计排行
  - 用户使用排行
  - 供应商使用排行
  - 成本分析

- **🎚️ 优先级路由** - 精细化流量分配
  - 供应商优先级设置
  - 权重分配
  - 分组管理

- **💰 价格同步** - 一键拉取 LiteLLM 价格表
  - 支持 Claude、OpenAI、Codex 等所有模型
  - 缓存 Token 定价支持

- **🤖 OpenAI 兼容** - 支持 `/v1/chat/completions` 端点
  - Codex CLI 支持
  - OpenAI ↔ Response API 双向转换
  - 模型重定向支持

- **💵 货币符号配置** - 可选前端展示货币符号
- **🎯 模型白名单** - 供应商级别的模型访问控制
- **🧹 日志清理** - 自动清理历史日志
- **🛡️ 敏感词拦截** - 内容过滤，保障服务安全
- **📝 Session 详情** - 记录请求/响应体（可选）
- **🔐 密钥权限控制** - 可限制密钥登录 Web UI
- **🧑‍💻 用户密钥工作台** - 普通用户 API Key 管理页面
- **📖 公开使用文档** - 免登录访问使用指南

### 界面预览

<div align="center">

<!-- TODO: 添加首页截图 -->
![GoogleChrome2025-11-1020.20.02](https://gaoziman.oss-cn-hangzhou.aliyuncs.com/uPic/Ct3TCP.png)

![axVE4l](https://gaoziman.oss-cn-hangzhou.aliyuncs.com/uPic/axVE4l.png)

_首页面板 - 系统概览与快速访问_

![供应商管理](https://gaoziman.oss-cn-hangzhou.aliyuncs.com/uPic/%E4%BE%9B%E5%BA%94%E5%95%86%E7%AE%A1%E7%90%86.png)

_供应商管理 - 配置上游服务、权重分配、流量限制、代理设置_

<!-- TODO: 添加统计排行榜截图 -->
![排行榜](https://gaoziman.oss-cn-hangzhou.aliyuncs.com/uPic/%E6%8E%92%E8%A1%8C%E6%A6%9C.png)

_统计排行榜 - 用户和供应商使用情况一目了然_

<!-- TODO: 添加日志详情截图 -->
![日志](https://gaoziman.oss-cn-hangzhou.aliyuncs.com/uPic/%E6%97%A5%E5%BF%97.png)

_详细日志记录 - Token 使用、成本计算、决策链追踪_

<!-- TODO: 添加 API 文档截图 -->
![image-20251110202951330](https://gaoziman.oss-cn-hangzhou.aliyuncs.com/uPic/image-20251110202951330.png)

_API 文档 - OpenAPI 3.1.0 + Scalar UI 交互式文档_

</div>

## 🚀 快速部署

### 前置要求

- Docker 和 Docker Compose
- ⏱️ 仅需 **2 分钟**即可启动完整服务

### 一键部署

**1. 克隆仓库**

```bash
git clone https://github.com/gaoziman/claude-code-hub-new.git
cd claude-code-hub-new
```

**2. 配置环境变量**

复制 `.env.example` 为 `.env` 并修改必要配置：

```bash
cp .env.example .env
```

**⚠️ 必须修改的配置：**

```bash
# 管理员认证（必须修改为强密码）
ADMIN_TOKEN=your-secure-admin-token-here

# 数据库配置（可选，默认值已配置好）
DSN="postgres://postgres:postgres@db:5432/claude_code_hub"

# Redis 配置（可选，默认值已配置好）
REDIS_URL=redis://redis:6379

# 应用端口（可选，默认 23000）
APP_PORT=23000
```

查看完整环境变量说明：[.env.example](.env.example)

**3. 启动服务**

```bash
# 启动所有服务（后台运行）
docker compose up -d

# 查看启动日志
docker compose logs -f
```

**4. 验证部署**

```bash
docker compose ps
```

确保三个容器都是 `healthy` 或 `running` 状态：

- `claude-code-hub-db` (PostgreSQL)
- `claude-code-hub-redis` (Redis)
- `claude-code-hub-app` (应用服务)

**5. 访问系统**

打开浏览器访问：`http://localhost:23000`

使用 `ADMIN_TOKEN` 登录管理后台

### 配置文件说明

- **[docker-compose.yaml](docker-compose.yaml)** - Docker Compose 配置文件
- **[.env.example](.env.example)** - 环境变量配置模板

### 常用管理命令

```bash
# 查看日志
docker compose logs -f          # 所有服务
docker compose logs -f app      # 仅应用

# 重启服务
docker compose restart app      # 重启应用

# 升级到最新版本
docker compose pull && docker compose up -d

# 备份数据（数据持久化在宿主机 ./data/ 目录）
# - ./data/postgres 映射到容器 /data (PostgreSQL 数据目录: /data/pgdata)
# - ./data/redis 映射到容器 /data (Redis AOF 持久化文件)
tar -czf backup_$(date +%Y%m%d_%H%M%S).tar.gz ./data/
```

<details>
<summary><b>更多管理命令</b></summary>

**服务管理**：

```bash
docker compose stop             # 停止服务
docker compose down             # 停止并删除容器
docker compose restart redis    # 重启 Redis
```

**数据库操作**：

```bash
# SQL 备份
docker exec claude-code-hub-db pg_dump -U postgres claude_code_hub > backup.sql

# 恢复数据
docker exec -i claude-code-hub-db psql -U postgres claude_code_hub < backup.sql

# 进入数据库
docker compose exec db psql -U postgres claude_code_hub
```

**Redis 操作**：

```bash
docker compose exec redis redis-cli ping           # 检查连接
docker compose exec redis redis-cli info stats     # 查看统计
docker compose exec redis redis-cli --scan         # 查看所有 key
docker compose exec redis redis-cli FLUSHALL       # ⚠️ 清空数据
```

**完全重置**（⚠️ 会删除所有数据）：

```bash
docker compose down && rm -rf ./data/ && docker compose up -d
```

</details>

## 📖 使用指南

### 1️⃣ 初始设置

首次访问 `http://localhost:23000`，使用 `ADMIN_TOKEN` 登录管理后台。

### 2️⃣ 添加 AI 服务提供商

进入 **设置 → 供应商管理**，点击"添加供应商"：

**基础配置**：
- 供应商名称和描述
- API 端点地址
- API 密钥
- 启用/禁用状态

**流量控制**：
- 权重（流量分配比例）
- 优先级（数字越小优先级越高）
- 并发 Session 限制
- 成本倍数（计费倍率）

**高级功能**：
- **模型重定向**：将 Claude 模型重定向到其他 AI 服务
- **模型白名单**：限制可调用的模型列表
- **代理配置**：配置 HTTP/HTTPS/SOCKS 代理

> **📌 重要说明：API 格式兼容性**
>
> 本服务**仅支持 Claude Code 格式**的 API 接口（如智谱 GLM、Kimi、Packy 等）。
>
> 如需使用其他格式的 AI 服务（Gemini、OpenAI、Ollama 等），请先使用 `claude-code-router` 进行格式转换，然后将转换后的服务地址添加到本系统。

#### 模型重定向功能详解

**使用场景**：将 Claude Code 客户端请求的 Claude 模型自动重定向到第三方 AI 服务。

**配置方式**：

1. 进入供应商管理，编辑供应商
2. 找到"模型重定向"部分
3. 添加映射规则：
   - 用户请求的模型：`claude-sonnet-4-5-20250929`
   - 实际转发的模型：`glm-4.6`（或其他第三方模型）

**示例配置**：

```json
{
  "claude-sonnet-4-5-20250929": "glm-4.6",
  "claude-opus-4": "gemini-2.5-pro",
  "claude-3-5-sonnet-20241022": "gpt-4o"
}
```

**计费说明**：系统使用**用户请求的 Claude 模型**价格计费，保持用户端费用透明。

#### 代理配置功能详解

**使用场景**：中国大陆访问海外 API、企业内网代理、IP 限制绕过。

**支持的代理类型**：
- HTTP 代理：`http://proxy.example.com:8080`
- HTTPS 代理：`https://proxy.example.com:8080`
- SOCKS4 代理：`socks4://127.0.0.1:1080`
- SOCKS5 代理：`socks5://user:password@proxy.example.com:1080`

**配置方式**：

1. 进入供应商管理，编辑供应商
2. 找到"代理配置"部分
3. 填写代理地址（包含协议前缀）
4. 选择是否启用"降级到直连"（代理失败时自动使用直连）
5. 点击"测试连接"验证配置

### 3️⃣ 创建用户和密钥

**添加用户**：

1. 进入 **设置 → 用户管理**
2. 点击"添加用户"
3. 配置：
   - 用户名称和描述
   - RPM 限制（每分钟请求数）
   - 每日额度（USD）
   - 并发 Session 限制
   - 供应商分组（可选）

**生成 API 密钥**：

1. 选择用户，点击"生成密钥"
2. 设置密钥名称和描述
3. 配置限流规则：
   - 5小时/周/月 金额限制
   - 并发 Session 限制
   - 过期时间（可选）
4. **⚠️ 复制并保存密钥**（仅显示一次）

### 4️⃣ 使用代理 API

用户使用生成的密钥调用服务，查看 `http://localhost:23000/usage-doc`

**基本请求示例**：

```bash
curl -X POST http://localhost:23000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 1024
  }'
```

**OpenAI 兼容端点**：

```bash
curl -X POST http://localhost:23000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-here" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 5️⃣ 监控和统计

**仪表盘**页面提供：

- 📈 实时请求量趋势
- 💰 成本统计和分析
- 👤 用户活跃度排行
- 🔧 供应商性能对比
- ⚠️ 异常请求监控

**日志查看**：

- 完整的请求/响应记录
- Token 使用量（含缓存 Token）
- 成本计算明细
- 决策链追踪（供应商选择过程）
- 错误信息和重试记录

**统计排行榜**：

- 日统计/月统计切换
- 用户使用排行（请求数、成本）
- 供应商使用排行（调用次数、成功率）

### 6️⃣ 配置模型价格

进入 **设置 → 价格管理**，配置各模型的计费单价：

**价格配置**：
- 模型名称
- 输入价格（USD/M tokens）
- 输出价格（USD/M tokens）
- 缓存创建价格（可选，Claude 特有）
- 缓存读取价格（可选，Claude 特有）

**批量导入**：

点击"同步 LiteLLM 价格"一键拉取最新价格表，支持：
- Claude 模型（含缓存 Token 定价）
- OpenAI 模型
- Codex 模型
- 其他第三方模型

**分页查询**：

- 每页显示 20/50/100/200 条
- 搜索模型名称（自动防抖）
- URL 参数同步，刷新页面不丢失状态

### 7️⃣ API 文档和集成

本系统提供完整的 REST API 接口，支持通过 HTTP 请求进行所有管理操作。

**访问 API 文档**：

登录后，进入 **设置 → API 文档** 或直接访问：

- **Scalar UI**（推荐）：`http://localhost:23000/api/actions/scalar`
- **Swagger UI**：`http://localhost:23000/api/actions/docs`
- **OpenAPI JSON**：`http://localhost:23000/api/actions/openapi.json`

**功能特性**：

- 📋 **39 个 REST API 端点**，覆盖所有管理功能
- 🔐 Cookie 认证保护
- 📝 完整的请求/响应示例
- 🧪 交互式 API 测试界面
- 📦 自动类型验证（Zod schemas）

**支持的功能模块**：

- 用户管理、密钥管理、供应商管理
- 模型价格、统计数据、使用日志
- 敏感词管理、Session 管理、通知管理

**API 调用示例**：

```bash
# 创建用户（需要先登录获取 session cookie）
curl -X POST http://localhost:23000/api/actions/users/addUser \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your-session-cookie" \
  -d '{
    "name": "Alice",
    "rpm": 60,
    "dailyQuota": 10
  }'
```

## 🛠️ 常见问题

<details>
<summary><b>❓ 如何重置管理员密码？</b></summary>

编辑 `.env` 文件，修改 `ADMIN_TOKEN`，然后重启：

```bash
docker compose restart app
```

</details>

<details>
<summary><b>❓ 端口已被占用怎么办？</b></summary>

编辑 `docker-compose.yaml`，修改端口映射：

```yaml
services:
  app:
    ports:
      - "8080:23000" # 修改左侧端口为可用端口
```

</details>

<details>
<summary><b>❓ 数据库迁移失败怎么办？</b></summary>

1. 检查应用日志：

   ```bash
   docker compose logs app | grep -i migration
   ```

2. 手动执行迁移：

   ```bash
   docker compose exec app pnpm db:migrate
   ```

3. 如果持续失败，重置数据库（⚠️ 会丢失数据）：
   ```bash
   docker compose down && rm -rf ./data/postgres && docker compose up -d
   ```

</details>

<details>
<summary><b>❓ Redis 连接失败怎么办？</b></summary>

本服务采用 **Fail Open 策略**，Redis 连接失败不会影响服务可用性。

检查 Redis 状态：

```bash
docker compose ps redis
docker compose exec redis redis-cli ping  # 应返回 PONG
```

Redis 不可用时，限流功能会自动降级，所有请求仍然正常通过。熔断器状态将无法持久化，应用重启后会重置。

</details>

<details>
<summary><b>❓ HTTP 访问时无法登录怎么办？</b></summary>

**问题现象**：使用 HTTP 访问系统（非 localhost）时，登录页面显示 Cookie 安全警告，无法登录。

**原因**：默认情况下，系统启用了 Cookie 安全策略（`ENABLE_SECURE_COOKIES=true`），仅允许 HTTPS 传输 Cookie。浏览器会自动放行 localhost 的 HTTP 访问，但拒绝远程 HTTP。

**解决方案**：

**方案 1：使用 HTTPS 访问（推荐）**

配置反向代理（如 Nginx）并启用 HTTPS，参见下方 [如何配置反向代理（Nginx + HTTPS）](#-如何配置反向代理nginx--https) 部分。

**方案 2：允许 HTTP Cookie（降低安全性）**

编辑 `.env` 文件：

```bash
ENABLE_SECURE_COOKIES=false
```

重启应用：

```bash
docker compose restart app
```

⚠️ **安全警告**：设置为 `false` 会允许 HTTP 传输 Cookie，仅推荐用于内网部署或测试环境。

</details>

<details>
<summary><b>❓ 支持哪些 AI 服务提供商？</b></summary>

**本服务仅支持 Claude Code 格式的 API 接口。**

**直接支持**：

- 原生提供 Claude Code 格式接口的服务商
- 通过 `claude-code-router` 转换后的服务

**间接支持**（需要先部署 [claude-code-router](https://github.com/zsio/claude-code-router) 进行协议转换）：

- 🔄 智谱 AI (GLM)、Moonshot AI (Kimi)、Packy 等
- 🔄 Google Gemini、OpenAI、Anthropic Claude 等
- 🔄 阿里通义千问、百度文心一言等
- 🔄 其他非 Claude Code 格式的 AI 服务

</details>

<details>
<summary><b>❓ 如何配置反向代理（Nginx + HTTPS）？</b></summary>

Nginx 配置示例：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:23000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 代理超时设置（用于流式响应）
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

配置 HTTPS 后，确保 `.env` 中 `ENABLE_SECURE_COOKIES=true`（默认值），以启用 Cookie 安全传输。

</details>

<details>
<summary><b>❓ 如何使用模型重定向功能？</b></summary>

模型重定向允许将 Claude Code 客户端请求的 Claude 模型自动重定向到第三方 AI 服务。

**配置步骤**：

1. 进入 **设置 → 供应商管理**
2. 编辑目标供应商（如智谱 AI）
3. 找到"模型重定向"部分
4. 添加映射规则：
   - 用户请求的模型：`claude-sonnet-4-5-20250929`
   - 实际转发的模型：`glm-4.6`
5. 保存配置

**使用效果**：

```bash
# 用户请求 Claude 模型
curl -X POST http://localhost:23000/v1/messages \
  -H "x-api-key: your-key" \
  -d '{"model": "claude-sonnet-4-5-20250929", ...}'

# 系统自动重定向到智谱 GLM
# 实际调用：glm-4.6
# 计费依据：claude-sonnet-4-5-20250929 的价格
```

**注意事项**：

- 需要在价格表中配置源模型（Claude）的价格
- 确保目标模型的能力与源模型匹配
- 建议配置 `joinClaudePool = true`

</details>

<details>
<summary><b>❓ 如何配置供应商代理？</b></summary>

代理配置允许通过代理服务器访问上游供应商 API，适用于网络受限环境。

**配置步骤**：

1. 进入 **设置 → 供应商管理**
2. 编辑供应商
3. 找到"代理配置"部分
4. 填写代理地址（包含协议前缀）：
   - HTTP: `http://proxy.example.com:8080`
   - HTTPS: `https://proxy.example.com:8080`
   - SOCKS4: `socks4://127.0.0.1:1080`
   - SOCKS5: `socks5://user:password@proxy.example.com:1080`
5. 选择是否启用"降级到直连"
6. 点击"测试连接"验证配置

**功能特性**：

- ✅ 支持认证代理（用户名/密码）
- ✅ 支持 HTTP/HTTPS/SOCKS4/SOCKS5 协议
- ✅ 故障降级（代理失败时自动直连）
- ✅ 连接测试工具
- ✅ 日志自动脱敏代理密码

</details>

<details>
<summary><b>❓ 价格表数据量大，加载很慢？</b></summary>

系统已支持价格表分页功能，可显著提升大规模数据加载性能。

**功能特性**：

- 默认每页显示 50 条记录
- 支持搜索模型名称（自动防抖 500ms）
- 可选每页 20/50/100/200 条
- URL 参数同步，刷新页面不丢失状态

**使用方式**：

1. 进入 **设置 → 价格管理**
2. 使用顶部搜索框过滤模型
3. 通过分页控件浏览数据
4. 可调整每页显示数量

**性能优化**：

- SQL 层面分页查询，避免全表扫描
- 搜索防抖（500ms），减少不必要的请求
- 服务端渲染 + 客户端交互，首屏加载快

</details>

<details>
<summary><b>❓ 熔断器状态如何持久化？</b></summary>

从 v1.0.1 开始，系统支持熔断器状态 Redis 持久化。

**功能特性**：

- ✅ 熔断器状态在 Redis 中持久化存储
- ✅ 支持多实例环境下的熔断器状态共享
- ✅ 应用重启后自动恢复熔断器状态
- ✅ 定期清理过期状态（默认 1 小时）

**配置要求**：

- Redis 必须可用（`REDIS_URL` 正确配置）
- 如果 Redis 不可用，熔断器会降级到内存模式

**查看状态**：

- 进入 **设置 → 供应商管理**
- 查看供应商的"熔断器状态"字段
- 状态包括：Closed（正常）、Open（熔断）、Half-Open（半开）

</details>

## 🏗️ 本地开发

### 前置要求

- Node.js 20+
- pnpm 9.15.0
- PostgreSQL 16
- Redis 7

### 开发环境启动

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env

# 启动数据库和 Redis（使用 Docker）
docker compose up -d db redis

# 生成数据库迁移
pnpm db:generate

# 执行数据库迁移
pnpm db:migrate

# 启动开发服务器（使用 Turbopack）
pnpm dev
```

访问 `http://localhost:13500`

### 开发命令

```bash
pnpm dev              # 启动开发服务器 (http://localhost:13500, 使用 Turbopack)
pnpm build            # 构建生产版本
pnpm start            # 启动生产服务器
pnpm lint             # 运行 ESLint
pnpm typecheck        # TypeScript 类型检查
pnpm format           # 格式化代码
pnpm format:check     # 检查代码格式

# 数据库命令
pnpm db:generate      # 生成 Drizzle 迁移文件
pnpm db:migrate       # 执行数据库迁移
pnpm db:push          # 直接推送 schema 到数据库（开发环境）
pnpm db:studio        # 启动 Drizzle Studio 可视化管理界面
```

### 本地开发工具（推荐）

本项目提供了完整的本地开发工具集（位于 `dev/` 目录）：

```bash
cd dev
make help      # 查看所有可用命令
make dev       # 一键启动完整开发环境
```

详见 `dev/README.md`

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 🙏 致谢

本项目的开发过程中参考和借鉴了以下优秀的开源项目：

- **[zsio/claude-code-hub](https://github.com/zsio/claude-code-hub)** - 本项目的基础框架，感谢 [@zsio](https://github.com/zsio) 提供的优秀架构设计
- **[ding113/claude-code-hub](https://github.com/ding113/claude-code-hub)** - 本项目的直接基础，感谢 [@ding113](https://github.com/ding113) 的二次开发和增强
- **[router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** - Codex CLI OpenAI 兼容层的实现参考了该项目，感谢其在 MIT 协议下的开源贡献

特别感谢上述项目的作者和贡献者！

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)

**关于引用和参考**：

- 基于 [ding113/claude-code-hub](https://github.com/ding113/claude-code-hub) 进行增强开发
- Codex CLI 的 OpenAI 兼容层实现参考了 [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 项目（MIT 协议）

## 🌟 Star History

如果这个项目对你有帮助，请给它一个 ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=gaoziman/claude-code-hub-new&type=Date)](https://star-history.com/#gaoziman/claude-code-hub-new&Date)

## 📞 支持与反馈

<div align="center">

**[🐛 报告问题](https://github.com/gaoziman/claude-code-hub-new/issues)** •
**[💡 功能建议](https://github.com/gaoziman/claude-code-hub-new/issues/new)** •
**[📖 查看文档](https://github.com/gaoziman/claude-code-hub-new)**

Based on [ding113/claude-code-hub](https://github.com/ding113/claude-code-hub) • Enhanced by [gaoziman](https://github.com/gaoziman)

</div>
