# ⚠️ 临时注释掉 syntax 指令,避免 Docker Hub 连接超时
# 如果配置了 Docker 镜像加速器,可以取消下面的注释
# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:22-slim AS build-base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM build-base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .

# 接收构建参数
ARG APP_VERSION=dev

# 设置为环境变量供 Next.js 使用
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION

# 构建时提供虚拟环境变量(避免预渲染失败)
# 这些值在运行时会被真实值覆盖
ENV DSN="postgresql://build:build@localhost:5432/build"
ENV REDIS_URL="redis://localhost:6379"

RUN pnpm run build

FROM node:22-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
WORKDIR /app

# 安装 PostgreSQL 客户端工具(用于数据库备份/恢复功能)
# 使用中科大镜像源加速 Debian 包下载(特别是 ARM 架构)
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y postgresql-client && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/.next/standalone ./
# Server Actions live inside .next/server; copy it or Next.js cannot resolve action IDs.
COPY --from=build --chown=node:node /app/.next/server ./.next/server
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

CMD ["node", "server.js"]
