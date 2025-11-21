#!/bin/bash

# Claude Code Hub - 快速回滚脚本
# 用法: ./scripts/rollback.sh 1.0.6
# 作者: Claude Code
# 更新: 2025-11-19

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
IMAGE_NAME="leojavatop/claude-code-hub"
SERVER="root@leocoder.cn"
DEPLOY_DIR="/opt/software/data/nginx"
COMPOSE_FILE="docker-compose.server-build.yml"

# 参数检查
if [ -z "$1" ]; then
  echo -e "${RED}错误: 请提供要回滚到的版本号${NC}"
  echo "用法: $0 <version>"
  echo "示例: $0 1.0.6"
  exit 1
fi

ROLLBACK_VERSION=$1

echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}  ⚠️  Claude Code Hub 回滚操作${NC}"
echo -e "${BLUE}===========================================${NC}"
echo -e "${YELLOW}当前版本: $(cat VERSION)${NC}"
echo -e "${YELLOW}回滚到版本: ${ROLLBACK_VERSION}${NC}"
echo -e "${BLUE}===========================================${NC}"

# 确认操作
echo -e "${RED}警告: 此操作将回滚生产环境！${NC}"
echo -e "${YELLOW}确认回滚到版本 ${ROLLBACK_VERSION}? (yes/no): ${NC}"
read -r response
if [[ "$response" != "yes" ]]; then
  echo -e "${RED}回滚操作已取消${NC}"
  exit 1
fi

# 步骤 1: 检查镜像是否存在
echo -e "\n${YELLOW}[1/4] 检查镜像是否存在...${NC}"
if ssh ${SERVER} "docker images ${IMAGE_NAME}:${ROLLBACK_VERSION} -q" | grep -q .; then
  echo -e "${GREEN}✓ 镜像 ${ROLLBACK_VERSION} 存在于服务器${NC}"
else
  echo -e "${YELLOW}! 镜像不存在，尝试从 Docker Hub 拉取...${NC}"
  ssh ${SERVER} "docker pull ${IMAGE_NAME}:${ROLLBACK_VERSION}"
  echo -e "${GREEN}✓ 镜像拉取完成${NC}"
fi

# 步骤 2: 备份当前容器
echo -e "\n${YELLOW}[2/4] 备份当前容器...${NC}"
ssh ${SERVER} "docker commit claude-code-hub-app ${IMAGE_NAME}:backup-before-rollback-\$(date +%Y%m%d-%H%M%S)" || true
echo -e "${GREEN}✓ 当前容器已备份${NC}"

# 步骤 3: 更新配置
echo -e "\n${YELLOW}[3/4] 更新配置并重启...${NC}"
ssh ${SERVER} "cd ${DEPLOY_DIR} && \
  sed -i 's|image: ${IMAGE_NAME}:.*|image: ${IMAGE_NAME}:${ROLLBACK_VERSION}|' ${COMPOSE_FILE} && \
  docker compose -f ${COMPOSE_FILE} down claude-code-hub-app && \
  docker compose -f ${COMPOSE_FILE} up -d claude-code-hub-app"
echo -e "${GREEN}✓ 容器重启完成${NC}"

# 步骤 4: 验证
echo -e "\n${YELLOW}[4/4] 等待启动并验证...${NC}"
sleep 10

DEPLOYED_VERSION=$(ssh ${SERVER} "docker exec claude-code-hub-app cat /app/VERSION 2>/dev/null" || echo "FAILED")
if [ "${DEPLOYED_VERSION}" == "${ROLLBACK_VERSION}" ]; then
  echo -e "${GREEN}✓ 版本验证通过: ${DEPLOYED_VERSION}${NC}"
else
  echo -e "${RED}✗ 版本验证失败${NC}"
  echo -e "${RED}期望: ${ROLLBACK_VERSION}${NC}"
  echo -e "${RED}实际: ${DEPLOYED_VERSION}${NC}"
  exit 1
fi

# 查看日志
echo -e "\n${YELLOW}最近日志（最后 10 行）:${NC}"
ssh ${SERVER} "docker logs claude-code-hub-app --tail 10"

# 完成
echo ""
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}  ✓ 回滚成功！${NC}"
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}当前版本: ${ROLLBACK_VERSION}${NC}"
echo -e "${GREEN}访问地址: https://claude.leocoder.cn${NC}"
echo -e "${GREEN}===========================================${NC}"
echo ""

echo -e "${BLUE}提示:${NC}"
echo -e "1. 请访问网站验证功能是否正常"
echo -e "2. 查看实时日志: ${YELLOW}ssh ${SERVER} \"docker logs -f claude-code-hub-app\"${NC}"
echo -e "3. 如需再次回滚，运行: ${YELLOW}./scripts/rollback.sh <version>${NC}"
