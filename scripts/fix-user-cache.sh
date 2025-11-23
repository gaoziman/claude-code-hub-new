#!/bin/bash

################################################################################
# 脚本名称: fix-user-cache.sh
# 功能描述: 快速修复指定用户的 Redis 缓存不一致问题
# 作者: Claude Code
# 创建日期: 2025-01-23
# 使用方法: ./fix-user-cache.sh <用户ID> [选项]
#          选项:
#            --dry-run    仅显示要清除的缓存，不实际执行
#            --verbose    显示详细的执行日志
################################################################################

set -e  # 遇到错误立即退出
set -u  # 使用未定义变量时报错

# 配置参数
REDIS_PASSWORD="claudecoder"
REDIS_CONTAINER="claude-code-hub-redis"
POSTGRES_CONTAINER="claude-code-hub-postgres"
POSTGRES_USER="postgres"
POSTGRES_DB="claude_code_hub"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 全局变量
DRY_RUN=false
VERBOSE=false

################################################################################
# 函数：显示帮助信息
################################################################################
function show_help() {
  cat << EOF
用法: $0 <用户ID> [选项]

功能: 快速修复指定用户的 Redis 缓存不一致问题

参数:
  用户ID        必需，要修复的用户 ID（数字）

选项:
  --dry-run     仅显示要清除的缓存，不实际执行
  --verbose     显示详细的执行日志
  --help        显示此帮助信息

示例:
  $0 4                    # 修复用户 4 的缓存
  $0 4 --dry-run          # 查看将要清除的缓存（不执行）
  $0 4 --verbose          # 显示详细日志
EOF
}

################################################################################
# 函数：日志输出
################################################################################
function log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

function log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

function log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

function log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

function log_verbose() {
  if [ "$VERBOSE" = true ]; then
    echo -e "${BLUE}[VERBOSE]${NC} $1"
  fi
}

################################################################################
# 函数：检查 Docker 容器状态
################################################################################
function check_container() {
  local container=$1

  if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    log_error "容器 ${container} 未运行"
    exit 1
  fi

  log_verbose "容器 ${container} 运行正常"
}

################################################################################
# 函数：测试 Redis 连接
################################################################################
function test_redis_connection() {
  local result
  result=$(docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning PING 2>&1)

  if [ "$result" != "PONG" ]; then
    log_error "Redis 连接失败: $result"
    exit 1
  fi

  log_verbose "Redis 连接测试通过"
}

################################################################################
# 函数：验证用户是否存在
################################################################################
function validate_user() {
  local user_id=$1

  local exists
  exists=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
    "SELECT EXISTS(SELECT 1 FROM users WHERE id = $user_id);" 2>&1 | xargs)

  if [ "$exists" != "t" ]; then
    log_error "用户 ID $user_id 不存在"
    exit 1
  fi

  log_verbose "用户 ID $user_id 验证通过"
}

################################################################################
# 函数：查询用户缓存信息
################################################################################
function show_cache_info() {
  local user_id=$1

  log_info "查询用户 $user_id 的当前缓存状态..."

  # 查询 Redis 缓存
  local weekly_cache
  local monthly_cache
  local rolling_count

  weekly_cache=$(docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning GET "user:${user_id}:cost_weekly" 2>/dev/null || echo "(nil)")
  monthly_cache=$(docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning GET "user:${user_id}:cost_monthly" 2>/dev/null || echo "(nil)")
  rolling_count=$(docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ZCARD "user:${user_id}:cost_5h_rolling" 2>/dev/null || echo "0")

  echo ""
  echo "┌─────────────────────────────────────────────┐"
  echo "│         当前 Redis 缓存状态                │"
  echo "├─────────────────────────────────────────────┤"
  printf "│ %-20s │ %-20s │\n" "缓存类型" "值"
  echo "├─────────────────────────────────────────────┤"
  printf "│ %-20s │ %-20s │\n" "周消费缓存" "$weekly_cache"
  printf "│ %-20s │ %-20s │\n" "月消费缓存" "$monthly_cache"
  printf "│ %-20s │ %-20s │\n" "5h滚动窗口记录数" "$rolling_count"
  echo "└─────────────────────────────────────────────┘"
  echo ""
}

################################################################################
# 函数：清除用户缓存
################################################################################
function clear_user_cache() {
  local user_id=$1

  if [ "$DRY_RUN" = true ]; then
    log_warning "DRY-RUN 模式：将要清除以下缓存（不实际执行）"
    echo "  - user:${user_id}:cost_weekly"
    echo "  - user:${user_id}:cost_monthly"
    echo "  - user:${user_id}:cost_5h_rolling"
    echo "  - user:${user_id}:total_cost"
    return 0
  fi

  log_info "开始清除用户 $user_id 的 Redis 缓存..."

  local deleted_count
  deleted_count=$(docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning DEL \
    "user:${user_id}:cost_weekly" \
    "user:${user_id}:cost_monthly" \
    "user:${user_id}:cost_5h_rolling" \
    "user:${user_id}:total_cost" 2>&1)

  log_verbose "删除了 $deleted_count 个缓存 KEY"

  # 验证清除结果
  local remaining
  remaining=$(docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning EXISTS \
    "user:${user_id}:cost_weekly" \
    "user:${user_id}:cost_monthly" \
    "user:${user_id}:cost_5h_rolling" 2>&1)

  if [ "$remaining" -eq 0 ]; then
    log_success "缓存清除成功（删除了 $deleted_count 个 KEY）"
  else
    log_error "缓存清除失败，还有 $remaining 个 KEY 存在"
    exit 1
  fi
}

################################################################################
# 函数：查询数据库真实消费
################################################################################
function show_database_info() {
  local user_id=$1

  log_info "查询用户 $user_id 的数据库真实消费..."

  echo ""
  docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
  id AS \"用户ID\",
  name AS \"用户名\",
  balance_usd AS \"余额(USD)\",
  limit_weekly_usd AS \"周限额(USD)\",
  limit_monthly_usd AS \"月限额(USD)\",
  (SELECT COALESCE(SUM(cost_usd), 0)
   FROM message_request
   WHERE user_id = $user_id
   AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Shanghai')
   AT TIME ZONE 'Asia/Shanghai') AS \"本周消费(USD)\",
  (SELECT COALESCE(SUM(cost_usd), 0)
   FROM message_request
   WHERE user_id = $user_id
   AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Shanghai')
   AT TIME ZONE 'Asia/Shanghai') AS \"本月消费(USD)\"
FROM users
WHERE id = $user_id;
" 2>&1
  echo ""
}

################################################################################
# 主函数
################################################################################
function main() {
  # 解析参数
  if [ $# -eq 0 ]; then
    show_help
    exit 1
  fi

  local user_id=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --help)
        show_help
        exit 0
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      --verbose)
        VERBOSE=true
        shift
        ;;
      -*)
        log_error "未知选项: $1"
        show_help
        exit 1
        ;;
      *)
        if [ -z "$user_id" ]; then
          user_id=$1
        else
          log_error "只能指定一个用户 ID"
          show_help
          exit 1
        fi
        shift
        ;;
    esac
  done

  # 验证用户 ID
  if [ -z "$user_id" ]; then
    log_error "缺少用户 ID 参数"
    show_help
    exit 1
  fi

  if ! [[ "$user_id" =~ ^[0-9]+$ ]]; then
    log_error "用户 ID 必须是数字: $user_id"
    exit 1
  fi

  # 显示脚本信息
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  Redis 缓存修复工具 - 用户 ID: $user_id"
  if [ "$DRY_RUN" = true ]; then
    echo "  模式: DRY-RUN (不会实际修改数据)"
  fi
  echo "═══════════════════════════════════════════════════════════"
  echo ""

  # 执行检查
  log_info "步骤 1/5: 检查 Docker 容器状态..."
  check_container "$REDIS_CONTAINER"
  check_container "$POSTGRES_CONTAINER"
  log_success "Docker 容器状态正常"
  echo ""

  log_info "步骤 2/5: 测试连接..."
  test_redis_connection
  validate_user "$user_id"
  log_success "连接测试通过"
  echo ""

  log_info "步骤 3/5: 查询当前缓存状态..."
  show_cache_info "$user_id"

  log_info "步骤 4/5: 清除 Redis 缓存..."
  clear_user_cache "$user_id"
  echo ""

  log_info "步骤 5/5: 查询数据库真实消费..."
  show_database_info "$user_id"

  # 显示完成信息
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  if [ "$DRY_RUN" = true ]; then
    log_warning "DRY-RUN 模式完成，未实际修改任何数据"
  else
    log_success "✅ 修复完成！用户 $user_id 可以正常使用了"
  fi
  echo "═══════════════════════════════════════════════════════════"
  echo ""
}

# 执行主函数
main "$@"
