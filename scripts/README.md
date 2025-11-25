# Redis 缓存一致性管理工具 - 使用文档

## 📋 目录

- [工具概述](#工具概述)
- [P0：快速修复工具](#p0快速修复工具-fix-user-cachesh)
- [P1：定时监控工具](#p1定时监控工具-check-redis-consistencysh)
- [常见问题处理流程](#常见问题处理流程)
- [日志管理](#日志管理)
- [故障排查](#故障排查)

---

## 工具概述

### 部署信息

| 项目         | 路径/配置                        |
| ------------ | -------------------------------- |
| **脚本目录** | `/opt/scripts/`                  |
| **日志文件** | `/var/log/redis-consistency.log` |
| **定时任务** | 每小时执行一次监控检查           |
| **所有者**   | root                             |

### 两个核心工具

1. **P0 - fix-user-cache.sh**：快速修复指定用户的 Redis 缓存不一致问题
2. **P1 - check-redis-consistency.sh**：定期检查所有用户的缓存一致性

---

## P0：快速修复工具（fix-user-cache.sh）

### 功能说明

当用户报告 429 限流错误时，使用此工具快速清除该用户的 Redis 缓存，让系统重新从数据库加载真实消费数据。

### 基本用法

```bash
# 修复用户 4 的缓存（实际执行）
/opt/scripts/fix-user-cache.sh 4

# 查看将要清除的缓存（不实际执行）
/opt/scripts/fix-user-cache.sh 4 --dry-run

# 显示详细的执行日志
/opt/scripts/fix-user-cache.sh 4 --verbose

# 查看帮助信息
/opt/scripts/fix-user-cache.sh --help
```

### 执行流程

1. ✅ 检查 Docker 容器状态（Redis、PostgreSQL）
2. ✅ 测试连接（Redis PING、用户存在性验证）
3. 📊 显示当前缓存状态（周/月消费、5h 滚动窗口记录数）
4. 🗑️ 清除 Redis 缓存（4 个 KEY）
5. 📋 显示数据库真实消费数据

### 输出示例

```
═══════════════════════════════════════════════════════════
  Redis 缓存修复工具 - 用户 ID: 4
═══════════════════════════════════════════════════════════

[INFO] 步骤 1/5: 检查 Docker 容器状态...
[SUCCESS] Docker 容器状态正常

[INFO] 步骤 3/5: 查询当前缓存状态...

┌─────────────────────────────────────────────┐
│         当前 Redis 缓存状态                │
├─────────────────────────────────────────────┤
│ 缓存类型         │ 值                  │
├─────────────────────────────────────────────┤
│ 周消费缓存      │ 50.1                 │
│ 月消费缓存      │ 50.1                 │
│ 5h滚动窗口记录数 │ 250                  │
└─────────────────────────────────────────────┘

[INFO] 步骤 4/5: 清除 Redis 缓存...
[SUCCESS] 缓存清除成功（删除了 3 个 KEY）

[INFO] 步骤 5/5: 查询数据库真实消费...

 用户ID | 用户名 | 余额(USD) | 周限额(USD) | 本周消费(USD)
--------+--------+-----------+-------------+---------------
      4 | 含含   |    0.0000 |       50.00 |    12.8

✅ 修复完成！用户 4 可以正常使用了
```

### 适用场景

- ✅ 用户报告 429 限流错误
- ✅ 用户反馈"套餐已用尽"但实际未用完
- ✅ Redis 缓存与数据库严重不一致
- ✅ 需要快速恢复用户服务

---

## P1：定时监控工具（check-redis-consistency.sh）

### 功能说明

每小时自动检查所有用户的 Redis 缓存与数据库的一致性，发现问题时记录到日志，可选择自动修复。

### 基本用法

```bash
# 检查所有用户（使用默认阈值 $5.0）
/opt/scripts/check-redis-consistency.sh

# 使用自定义阈值 $10.0
/opt/scripts/check-redis-consistency.sh --threshold 10.0

# 仅检查用户 4
/opt/scripts/check-redis-consistency.sh --user-id 4

# 自动修复不一致的缓存
/opt/scripts/check-redis-consistency.sh --auto-fix

# 仅显示摘要（减少日志量）
/opt/scripts/check-redis-consistency.sh --summary

# 查看帮助信息
/opt/scripts/check-redis-consistency.sh --help
```

### 定时任务配置

已自动配置为每小时执行一次：

```bash
# 查看定时任务
crontab -l | grep redis-consistency

# 输出：
# Redis 缓存一致性检查 - 每小时执行一次
0 * * * * /opt/scripts/check-redis-consistency.sh --summary >> /var/log/redis-consistency.log 2>&1
```

### 输出示例

```
═══════════════════════════════════════════════════════════
  Redis 缓存一致性检查 - 2025-11-23 02:00:00
───────────────────────────────────────────────────────────
  差异阈值: $5.0
  检查范围: 所有启用用户
  自动修复: 禁用
═══════════════════════════════════════════════════════════

[INFO] 2025-11-23 02:00:01 - 开始检查 10 个用户...

[WARNING] 2025-11-23 02:00:02 - 用户 4 缓存不一致！
  - 数据库消费: $12.80
  - Redis 缓存: $50.10
  - 差异: $37.30

═══════════════════════════════════════════════════════════
                   检查结果摘要
═══════════════════════════════════════════════════════════
检查用户总数: 10
不一致用户数: 1
不一致率: 10.00%
最大差异: $37.30 (用户 ID: 4)

建议执行以下命令修复：
  /opt/scripts/fix-user-cache.sh 4

或启用自动修复模式：
  /opt/scripts/check-redis-consistency.sh --auto-fix
═══════════════════════════════════════════════════════════
```

### 适用场景

- ✅ 预防性监控，及时发现缓存不一致
- ✅ 定期巡检系统健康状态
- ✅ 批量检查所有用户
- ✅ 自动化运维

---

## 常见问题处理流程

### 场景 1：用户报告 429 限流错误

**步骤：**

1. **确认用户 ID**

   ```bash
   # 查看最近的限流日志
   docker logs claude-code-hub-app --tail 50 | grep -i "rate_limit"
   # 提取用户 ID（例如：user=4）
   ```

2. **快速修复**

   ```bash
   # 先用 --dry-run 查看缓存状态
   /opt/scripts/fix-user-cache.sh 4 --dry-run

   # 确认后执行修复
   /opt/scripts/fix-user-cache.sh 4
   ```

3. **验证结果**
   - 通知用户重试
   - 查看应用日志确认请求成功

---

### 场景 2：定期巡检发现不一致

**步骤：**

1. **查看日志**

   ```bash
   # 查看最近 50 行日志
   tail -50 /var/log/redis-consistency.log

   # 搜索不一致的用户
   grep "缓存不一致" /var/log/redis-consistency.log
   ```

2. **判断影响范围**
   - 如果不一致用户 < 5%：逐个修复
   - 如果不一致用户 > 20%：考虑批量修复或检查系统问题

3. **执行修复**

   ```bash
   # 方式 1：逐个修复
   /opt/scripts/fix-user-cache.sh 4
   /opt/scripts/fix-user-cache.sh 7

   # 方式 2：自动修复所有不一致的用户
   /opt/scripts/check-redis-consistency.sh --auto-fix
   ```

---

### 场景 3：批量清理所有用户缓存

**适用情况：** 系统升级后或 Redis 数据疑似损坏

```bash
# ⚠️ 警告：会清除所有用户的缓存，导致短时间内数据库压力增大
# 仅在紧急情况下使用

docker exec claude-code-hub-redis redis-cli -a claudecoder --no-auth-warning \
  --scan --pattern 'user:*:cost*' | \
  xargs docker exec -i claude-code-hub-redis redis-cli -a claudecoder --no-auth-warning DEL

# 验证清除结果
docker exec claude-code-hub-redis redis-cli -a claudecoder --no-auth-warning \
  KEYS 'user:*:cost*' | wc -l
# 返回 0 表示清除成功
```

---

## 日志管理

### 查看日志

```bash
# 查看最近 20 行
tail -20 /var/log/redis-consistency.log

# 实时跟踪日志
tail -f /var/log/redis-consistency.log

# 搜索不一致记录
grep "不一致" /var/log/redis-consistency.log

# 统计不一致次数
grep -c "缓存不一致" /var/log/redis-consistency.log
```

### 日志轮转（可选）

如果日志文件过大，配置日志轮转：

```bash
# 创建 logrotate 配置
cat > /etc/logrotate.d/redis-consistency << EOF
/var/log/redis-consistency.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
EOF

# 测试配置
logrotate -d /etc/logrotate.d/redis-consistency

# 手动执行轮转
logrotate -f /etc/logrotate.d/redis-consistency
```

---

## 故障排查

### 问题 1：脚本执行权限错误

**错误**：`Permission denied`

**解决**：

```bash
chmod +x /opt/scripts/fix-user-cache.sh
chmod +x /opt/scripts/check-redis-consistency.sh
```

---

### 问题 2：Redis 连接失败

**错误**：`AUTH failed` 或 `Connection refused`

**解决**：

```bash
# 1. 检查 Redis 容器状态
docker ps | grep redis

# 2. 测试 Redis 连接
docker exec claude-code-hub-redis redis-cli -a claudecoder --no-auth-warning PING

# 3. 检查密码是否正确（脚本中为 claudecoder）
```

---

### 问题 3：PostgreSQL 连接失败

**错误**：`could not connect to server`

**解决**：

```bash
# 1. 检查 PostgreSQL 容器状态
docker ps | grep postgres

# 2. 测试数据库连接
docker exec claude-code-hub-postgres psql -U postgres -d claude_code_hub -c "SELECT 1;"
```

---

### 问题 4：定时任务未执行

**检查**：

```bash
# 1. 查看 cron 服务状态
systemctl status crond

# 2. 检查 crontab 配置
crontab -l | grep redis-consistency

# 3. 查看 cron 日志
grep redis-consistency /var/log/cron

# 4. 手动执行测试
/opt/scripts/check-redis-consistency.sh --summary
```

---

## 快速参考卡片

### P0 快速修复（紧急使用）

```bash
# 查看缓存状态
/opt/scripts/fix-user-cache.sh <用户ID> --dry-run

# 执行修复
/opt/scripts/fix-user-cache.sh <用户ID>
```

### P1 检查监控（日常巡检）

```bash
# 查看日志
tail -50 /var/log/redis-consistency.log

# 手动检查
/opt/scripts/check-redis-consistency.sh --summary

# 自动修复
/opt/scripts/check-redis-consistency.sh --auto-fix
```

### 常用命令

```bash
# 查看所有用户的 Redis 缓存
docker exec claude-code-hub-redis redis-cli -a claudecoder --no-auth-warning \
  KEYS 'user:*:cost*'

# 查看特定用户的缓存值
docker exec claude-code-hub-redis redis-cli -a claudecoder --no-auth-warning \
  MGET user:4:cost_weekly user:4:cost_monthly

# 查询数据库中的真实消费
docker exec claude-code-hub-postgres psql -U postgres -d claude_code_hub -c "
SELECT id, name,
  (SELECT COALESCE(SUM(cost_usd), 0) FROM message_request
   WHERE user_id = users.id
   AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Shanghai')
   AT TIME ZONE 'Asia/Shanghai') as weekly_cost
FROM users WHERE id = 4;
"
```

---

## 联系支持

如有问题，请检查：

1. 📋 本文档的故障排查章节
2. 📝 `/var/log/redis-consistency.log` 日志文件
3. 📱 Docker 容器日志：`docker logs claude-code-hub-app`

---

**文档版本**：v1.0.0
**最后更新**：2025-11-23
**维护者**：Claude Code
