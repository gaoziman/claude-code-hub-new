#!/bin/bash

# Claude Code Hub - 完整部署脚本
# 用法: ./scripts/deploy-to-production.sh 1.0.7
# 作者: Claude Code
# 更新: 2025-11-19

set -e  # 遇到错误立即退出

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
IMAGE_NAME="leojavatop/claude-code-hub"
SERVER="root@leocoder.cn"
DEPLOY_DIR="/opt/software/data/nginx"
COMPOSE_FILE="docker-compose.server-build.yml"

# 参数检查
if [ -z "$1" ]; then
  echo -e "${RED}错误: 请提供版本号${NC}"
  echo "用法: $0 <version>"
  echo "示例: $0 1.0.7"
  exit 1
fi

VERSION=$1

# 打印banner
print_banner() {
  echo -e "${BLUE}===========================================${NC}"
  echo -e "${BLUE}  Claude Code Hub 自动化部署脚本${NC}"
  echo -e "${BLUE}  版本: ${VERSION}${NC}"
  echo -e "${BLUE}  时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
  echo -e "${BLUE}===========================================${NC}"
}

# 打印步骤
print_step() {
  echo -e "\n${YELLOW}[$1] $2${NC}"
}

# 打印成功
print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

# 打印错误
print_error() {
  echo -e "${RED}✗ $1${NC}"
}

# 打印信息
print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

# 确认操作
confirm() {
  echo -e "${YELLOW}$1 (y/n): ${NC}"
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo -e "${RED}操作已取消${NC}"
    exit 1
  fi
}

# 主流程
main() {
  print_banner

  # 步骤 1: 更新版本号
  print_step "1/9" "更新版本号..."
  echo "${VERSION}" > VERSION
  print_success "版本号已更新为 ${VERSION}"

  # 步骤 2: Git 状态检查
  print_step "2/9" "检查 Git 状态..."
  if [[ -n $(git status -s) ]]; then
    print_info "检测到未提交的更改:"
    git status -s
    confirm "是否继续部署?"
  fi
  print_success "Git 状态检查完成"

  # 步骤 3: 类型检查
  print_step "3/9" "执行 TypeScript 类型检查..."
  if ! pnpm typecheck; then
    print_error "类型检查失败，请修复错误后重试"
    exit 1
  fi
  print_success "类型检查通过"

  # 步骤 4: 构建镜像
  print_step "4/9" "构建 Docker 镜像..."
  print_info "平台: linux/amd64"
  print_info "标签: ${VERSION}, latest"

  if ! docker build --no-cache \
    -f deploy/Dockerfile \
    -t ${IMAGE_NAME}:${VERSION} \
    -t ${IMAGE_NAME}:latest \
    --build-arg APP_VERSION=${VERSION} \
    --platform linux/amd64 \
    . ; then
    print_error "镜像构建失败"
    exit 1
  fi
  print_success "镜像构建完成"

  # 步骤 5: 验证镜像
  print_step "5/9" "验证镜像..."
  BUILT_VERSION=$(docker run --rm --entrypoint cat ${IMAGE_NAME}:${VERSION} /app/VERSION)
  if [ "${BUILT_VERSION}" == "${VERSION}" ]; then
    print_success "镜像验证通过: ${BUILT_VERSION}"
  else
    print_error "镜像验证失败: 期望 ${VERSION}, 实际 ${BUILT_VERSION}"
    exit 1
  fi

  # 检查迁移文件
  print_info "检查数据库迁移文件..."
  docker run --rm --entrypoint ls ${IMAGE_NAME}:${VERSION} /app/drizzle/ | head -5

  # 步骤 6: 推送到 Docker Hub
  print_step "6/9" "推送镜像到 Docker Hub..."
  confirm "确认推送镜像到 Docker Hub?"

  print_info "推送版本标签: ${VERSION}"
  docker push ${IMAGE_NAME}:${VERSION}

  print_info "推送 latest 标签"
  docker push ${IMAGE_NAME}:latest

  print_success "镜像推送完成"

  # 步骤 7: 服务器拉取镜像
  print_step "7/9" "服务器拉取镜像..."
  print_info "服务器: ${SERVER}"

  if ! ssh ${SERVER} "docker pull ${IMAGE_NAME}:${VERSION}"; then
    print_error "镜像拉取失败"
    exit 1
  fi
  print_success "镜像拉取完成"

  # 步骤 8: 更新配置并重启
  print_step "8/9" "更新配置并重启容器..."
  confirm "确认重启生产环境容器?"

  print_info "备份当前容器..."
  ssh ${SERVER} "docker commit claude-code-hub-app ${IMAGE_NAME}:backup-\$(date +%Y%m%d-%H%M%S)" || true

  print_info "更新 docker-compose 配置..."
  ssh ${SERVER} "cd ${DEPLOY_DIR} && \
    sed -i 's|image: ${IMAGE_NAME}:.*|image: ${IMAGE_NAME}:${VERSION}|' ${COMPOSE_FILE}"

  print_info "停止旧容器..."
  ssh ${SERVER} "cd ${DEPLOY_DIR} && \
    docker compose -f ${COMPOSE_FILE} down claude-code-hub-app"

  print_info "启动新容器..."
  ssh ${SERVER} "cd ${DEPLOY_DIR} && \
    docker compose -f ${COMPOSE_FILE} up -d claude-code-hub-app"

  print_success "容器重启完成"

  # 步骤 9: 等待启动并验证
  print_step "9/9" "等待启动并验证..."
  print_info "等待 15 秒让容器完全启动..."
  sleep 15

  # 验证容器状态
  print_info "检查容器状态..."
  CONTAINER_STATUS=$(ssh ${SERVER} "docker ps --filter name=claude-code-hub-app --format '{{.Status}}'")
  echo "容器状态: ${CONTAINER_STATUS}"

  # 验证版本
  print_info "验证部署版本..."
  DEPLOYED_VERSION=$(ssh ${SERVER} "docker exec claude-code-hub-app cat /app/VERSION 2>/dev/null" || echo "FAILED")

  if [ "${DEPLOYED_VERSION}" == "${VERSION}" ]; then
    print_success "版本验证通过: ${DEPLOYED_VERSION}"
  else
    print_error "版本验证失败: 期望 ${VERSION}, 实际 ${DEPLOYED_VERSION}"
    print_error "请检查容器日志: ssh ${SERVER} \"docker logs claude-code-hub-app\""
    exit 1
  fi

  # 检查最近的日志
  print_info "查看最近日志（最后 10 行）..."
  ssh ${SERVER} "docker logs claude-code-hub-app --tail 10"

  # 完成
  echo ""
  echo -e "${GREEN}===========================================${NC}"
  echo -e "${GREEN}  🎉 部署成功！${NC}"
  echo -e "${GREEN}===========================================${NC}"
  echo -e "${GREEN}版本: ${VERSION}${NC}"
  echo -e "${GREEN}访问地址: https://claude.leocoder.cn${NC}"
  echo -e "${GREEN}时间: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
  echo -e "${GREEN}===========================================${NC}"
  echo ""

  # 后续操作提示
  echo -e "${BLUE}后续操作:${NC}"
  echo -e "1. 访问网站验证功能: ${BLUE}https://claude.leocoder.cn${NC}"
  echo -e "2. 查看实时日志: ${YELLOW}ssh ${SERVER} \"docker logs -f claude-code-hub-app\"${NC}"
  echo -e "3. 检查容器状态: ${YELLOW}ssh ${SERVER} \"docker ps | grep claude-code-hub\"${NC}"
  echo -e "4. 如需回滚: ${YELLOW}./scripts/rollback.sh ${VERSION}${NC}"
  echo ""
}

# 错误处理
trap 'print_error "部署过程中出现错误，已终止"; exit 1' ERR

# 执行主流程
main
