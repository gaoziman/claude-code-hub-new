#!/bin/bash

################################################################################
# 脚本名称: check-redis-consistency.sh
# 功能描述: 定期检查 Redis 缓存与数据库的一致性
# 作者: Claude Code
# 创建日期: 2025-01-23
# 使用方法: ./check-redis-consistency.sh [选项]
#          选项:
#            --threshold <金额>  自定义差异阈值（默认 $5.0）
#            --user-id <ID>     仅检查指定用户
#            --auto-fix         自动修复不一致的缓存
#            --summary          只显示摘要，不显示详细信息
################################################################################

set -e  # 遇到错误立即退出
set -u  # 使用未定义变量时报错

# 配置参数
REDIS_PASSWORD="claudecoder"
REDIS_CONTAINER="claude-code-hub-redis"
POSTGRES_CONTAINER="claude-code-hub-postgres"
POSTGRES_USER="postgres"
POSTGRES_DB="claude_code_hub"

# 默认参数
THRESHOLD=5.0          # 差异阈值（美元）
AUTO_FIX=false         # 是否自动修复
SPECIFIC_USER_ID=""    # 指定检查的用户 ID
SUMMARY_ONLY=false     # 仅显示摘要

# 统计变量
TOTAL_USERS=0
INCONSISTENT_COUNT=0
MAX_DIFF=0
MAX_DIFF_USER=0

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

################################################################################
# 函数：显示帮助信息
################################################################################
function show_help() {
  cat << EOF
用法: $0 [选项]

功能: 定期检查 Redis 缓存与数据库的一致性，发现并修复数据不一致问题

选项:
  --threshold <金额>    自定义差异阈值（默认: \$5.0）
  --user-id <ID>       仅检查指定用户 ID
  --auto-fix           自动修复不一致的缓存
  --summary            只显示摘要，不显示详细信息
  --help               显示此帮助信息

示例:
  $0                           # 检查所有用户（阈值 \$5.0）
  $0 --threshold 10.0          # 使用 \$10.0 作为阈值
  $0 --user-id 4               # 仅检查用户 4
  $0 --auto-fix                # 自动修复不一致的缓存
  $0 --summary                 # 仅显示摘要
EOF
}

################################################################################
# 函数：日志输出
################################################################################
function log_info() {
  echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

function log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

function log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

function log_error() {
  echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

################################################################################
# 函数：检查单个用户的缓存一致性
################################################################################
function check_user_consistency() {
  local user_id=$1

  # 查询数据库周消费
  local db_cost
  db_cost=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "
    SELECT COALESCE(SUM(cost_usd), 0)
    FROM message_request
    WHERE user_id = $user_id
    AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai';
  " 2>&1 | xargs)

  # 处理空值
  if [ -z "$db_cost" ] || [ "$db_cost" = "" ]; then
    db_cost=0
  fi

  # 查询 Redis 缓存
  local redis_cost
  redis_cost=$(docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning GET "user:${user_id}:cost_weekly" 2>/dev/null || echo "")

  # 处理 Redis 返回值
  if [ -z "$redis_cost" ] || [ "$redis_cost" = "(nil)" ]; then
    redis_cost=0
  fi

  # 计算差异（绝对值）
  local diff
  diff=$(echo "scale=4; if ($redis_cost >= $db_cost) $redis_cost - $db_cost else $db_cost - $redis_cost" | bc)

  # 更新最大差异
  if (( $(echo "$diff > $MAX_DIFF" | bc -l) )); then
    MAX_DIFF=$diff
    MAX_DIFF_USER=$user_id
  fi

  # 判断是否超过阈值
  if (( $(echo "$diff > $THRESHOLD" | bc -l) )); then
    INCONSISTENT_COUNT=$((INCONSISTENT_COUNT + 1))

    if [ "$SUMMARY_ONLY" = false ]; then
      log_warning "用户 $user_id 缓存不一致！"
      echo "  - 数据库消费: \$$db_cost"
      echo "  - Redis 缓存: \$$redis_cost"
      echo "  - 差异: \$$diff"
    fi

    # 自动修复
    if [ "$AUTO_FIX" = true ]; then
      log_info "自动修复用户 $user_id 的缓存..."
      docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning DEL \
        "user:${user_id}:cost_weekly" \
        "user:${user_id}:cost_monthly" \
        "user:${user_id}:cost_5h_rolling" \
        "user:${user_id}:total_cost" >/dev/null 2>&1
      log_success "用户 $user_id 的缓存已清除"
    fi
  fi
}

################################################################################
# 函数：显示检查摘要
################################################################################
function show_summary() {
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "                   检查结果摘要"
  echo "═══════════════════════════════════════════════════════════"
  echo "检查用户总数: $TOTAL_USERS"
  echo "不一致用户数: $INCONSISTENT_COUNT"

  if [ "$INCONSISTENT_COUNT" -gt 0 ]; then
    echo "不一致率: $(echo "scale=2; $INCONSISTENT_COUNT * 100 / $TOTAL_USERS" | bc)%"
    echo "最大差异: \$$MAX_DIFF (用户 ID: $MAX_DIFF_USER)"

    if [ "$AUTO_FIX" = true ]; then
      log_success "已自动修复 $INCONSISTENT_COUNT 个用户的缓存"
    else
      log_warning "发现 $INCONSISTENT_COUNT 个用户需要修复"
      echo ""
      echo "建议执行以下命令修复："
      echo "  /opt/scripts/fix-user-cache.sh <用户ID>"
      echo ""
      echo "或启用自动修复模式："
      echo "  $0 --auto-fix"
    fi
  else
    log_success "所有用户的缓存数据一致 ✅"
  fi
  echo "═══════════════════════════════════════════════════════════"
  echo ""
}

################################################################################
# 主函数
################################################################################
function main() {
  # 解析参数
  while [ $# -gt 0 ]; do
    case "$1" in
      --help)
        show_help
        exit 0
        ;;
      --threshold)
        if [ -z "${2:-}" ]; then
          log_error "--threshold 需要指定金额"
          exit 1
        fi
        THRESHOLD=$2
        shift 2
        ;;
      --user-id)
        if [ -z "${2:-}" ]; then
          log_error "--user-id 需要指定用户 ID"
          exit 1
        fi
        SPECIFIC_USER_ID=$2
        shift 2
        ;;
      --auto-fix)
        AUTO_FIX=true
        shift
        ;;
      --summary)
        SUMMARY_ONLY=true
        shift
        ;;
      -*)
        log_error "未知选项: $1"
        show_help
        exit 1
        ;;
      *)
        log_error "未知参数: $1"
        show_help
        exit 1
        ;;
    esac
  done

  # 显示脚本信息
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  Redis 缓存一致性检查 - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "───────────────────────────────────────────────────────────"
  echo "  差异阈值: \$$THRESHOLD"
  if [ -n "$SPECIFIC_USER_ID" ]; then
    echo "  检查范围: 用户 ID $SPECIFIC_USER_ID"
  else
    echo "  检查范围: 所有启用用户"
  fi
  if [ "$AUTO_FIX" = true ]; then
    echo "  自动修复: 启用 ✅"
  else
    echo "  自动修复: 禁用"
  fi
  echo "═══════════════════════════════════════════════════════════"
  echo ""

  # 获取用户列表
  local user_list
  if [ -n "$SPECIFIC_USER_ID" ]; then
    user_list="$SPECIFIC_USER_ID"
    TOTAL_USERS=1
  else
    user_list=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "
      SELECT id FROM users WHERE deleted_at IS NULL AND is_enabled = true ORDER BY id;
    " 2>&1 | xargs)

    # 统计用户数量
    TOTAL_USERS=$(echo "$user_list" | wc -w)
  fi

  log_info "开始检查 $TOTAL_USERS 个用户..."
  echo ""

  # 遍历检查每个用户
  for user_id in $user_list; do
    # 跳过空行
    [[ -z "$user_id" ]] && continue

    # 检查用户
    check_user_consistency "$user_id"
  done

  # 显示摘要
  show_summary
}

# 执行主函数
main "$@"
