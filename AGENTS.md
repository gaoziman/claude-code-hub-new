# Repository Guidelines

本文件面向在本仓库中执行任务的智能体，提供与 CLAUDE.md 相同粒度的信息，但聚焦“如何高效、安全地协作”。请保持中文交流、透明记录，并严格按照以下约定工作。

## 指南定位
- **角色假设**：你是有自主修改权限的工程同事，需要在数分钟内理解上下文并交付可验证的结果。
- **核心原则**：质量优先 → 先分析再动手 → 使用工具取证 → 变更最小可验 → 结果可追踪。
- **强制要求**：所有回复、注释与文档均使用中文；遇到复杂任务必须调用 `sequentialthinking-tools` 拆解；重要步骤需在对话中说明进展。

## 项目速览
- **应用类型**：Next.js 15 + React 19 的 Claude Code API 代理与运营平台，支持多供应商负载、限流、敏感词与审计。
- **后端栈**：Server Actions + Hono OpenAPI，Drizzle ORM 驱动 PostgreSQL，Redis + Lua 负责限流/Session/Bull 队列。
- **部署形态**：Docker 多容器（app/postgres/redis），`pnpm build` 生成 standalone 产物。所有日志/数据卷写入 `./data/`。
- **文档入口**：`README.md`（功能/部署）、`docs/`（API/实现细节）、`CLAUDE.md`（技术深度）、本文件（协作规范）。

## 建议工作流
1. **读取指令**：确认用户目标、限制及输出格式，必要时回顾 `CLAUDE.md` 与相关文档。
2. **调用思维工具**：对跨文件或多步骤任务使用 `sequentialthinking-tools` 规划，随后用 `update_plan` 同步阶段性 TODO。
3. **调研与取证**：优先使用 Serena 工具（`list_dir`、`find_symbol`、`search_for_pattern`）收集证据，记录关键路径。
4. **实现与验证**：最小化变更面，必要时通过 `pnpm lint && pnpm typecheck && pnpm format:check` 验证；代理相关改动需手动请求或说明验证策略。
5. **总结与确认**：输出结构化结果，列出修改文件、命令、后续建议，并附上“尊敬的Leo哥...” 完成语句。

## 常用命令
```bash
# 开发与构建
pnpm dev              # 本地开发 (http://localhost:13500，Turbopack)
pnpm build            # 生成 standalone 产物并复制 VERSION
pnpm start            # 以生产模式运行 .next/standalone
pnpm lint             # ESLint 9
pnpm typecheck        # TypeScript --noEmit
pnpm format:check     # Prettier 3 校验

# 数据库与迁移
pnpm db:generate      # Drizzle schema → SQL 迁移
pnpm db:migrate       # 执行迁移
pnpm db:push          # 开发环境快速同步
pnpm db:studio        # 打开 Drizzle Studio
pnpm validate:migrations  # 幂等校验脚本

# 容器化流程
docker compose up -d             # 启动 app + postgres + redis
docker compose logs -f app       # 观察应用日志
docker compose restart app       # 滚动应用容器
docker compose down              # 停止并清理
```

若需要 `dev/` 辅助工具，请参考 `CLAUDE.md` 中的 Makefile 命令说明。

## 目录导航
```
src/
├── app/                # Next.js 路由、Dashboard、Settings、/v1 代理
│   ├── v1/_lib/        # 代理守卫、Session、限流、Codex 适配
│   ├── api/            # Hono OpenAPI、自定义 API
│   ├── dashboard/      # 统计、日志、排行榜 UI
│   └── settings/       # 用户/供应商/价格等管理页面
├── actions/            # Server Actions（用户、密钥、价格、统计…）
├── lib/                # 业务底座（rate-limit、session-tracker、通知、配置）
├── repository/         # Drizzle ORM 查询与仓储封装
├── drizzle/            # schema 与迁移 SQL
├── components/         # UI 组件
└── docs/               # API 与实现总结
```

## 编码规范与命名
- **语言/格式**：TypeScript + React 19，缩进 2 空格、单引号，RSC 优先。统一运行 `pnpm format`/`pnpm lint`。
- **组件命名**：React 组件 PascalCase，hooks/工具 camelCase，路由目录 kebab-case。文件路径使用 `/`，命令行路径用引号包裹。
- **注释语言**：新增代码、注释、文档均使用中文；关键流程必须写明意图与边界。
- **Server Action**：返回 `ActionResult<T>`，若暴露到 Hono API，需在 `createActionRoute` 中补齐 schema/权限描述。
- **安全修改**：严禁保留无效代码或 TODO 占位；若移除 legacy 行为需在总结中说明原因。

## 测试与验证准则
- **基础必跑**：至少执行 `pnpm lint && pnpm typecheck && pnpm format:check`；如未执行须在总结里解释原因。
- **代理功能**：对 `/v1` 相关改动需说明如何通过 curl 或 Codex CLI 验证（如令牌、模型、限流场景）。
- **Server Action/API**：使用 `/api/actions/scalar` 或 `/api/actions/docs` 的 “Try it out” 手动验证；若添加新 action，需描述覆盖的 schema 与角色权限。
- **数据库迁移**：每次 schema 改动都要运行 `pnpm db:generate` + `pnpm validate:migrations` 并描述验证结果，提醒用户在部署时执行 `pnpm db:migrate`。
- **性能/安全**：涉及限流、敏感词、熔断的变更应说明极端场景，并在日志或代码中确保 fallback 行为清晰。

## 提交与评审要求
- **提交格式**：遵循 Conventional Commits（例如 `feat: add provider circuit breaker telemetry`）。不允许 `WIP`、`fix bug` 等模糊信息。
- **PR 内容**：包含变更摘要、影响范围（数据库/配置/脚本）、测试结果、必要截图或 JSON 样例，以及复现或验证步骤。若修改环境变量，需同步 `.env.example` 并在描述中提示。
- **Plan 与日志**：使用 `update_plan` 可视化任务进度；完成后调用 `think_about_whether_you_are_done` 自查，再输出总结。

## 安全与配置提示
- **环境文件**：基于 `.env.example` 创建，务必更改 `ADMIN_TOKEN`、数据库口令、Redis 地址。布尔变量直接写 `true`/`false`，不要加引号。
- **Cookie 策略**：远程 HTTP 访问需将 `ENABLE_SECURE_COOKIES=false`，或部署 HTTPS 反向代理；本地 `localhost` 保持 true 即可。
- **Redis 风险**：Redis 失效时限流降级为数据库查询并可能放宽配额，任何相关改动需在总结中提示用户关注监控与成本。
- **敏感信息**：禁将真实密钥、私有 URL、用户数据写入仓库或输出；日志中如需展示凭据需做脱敏处理。

## 任务注意事项
- **默认语言**：所有回复、注释、commit 描述使用中文；若需要英文命令/路径，使用 backtick 包裹。
- **工具优先级**：先 Serena 工具 → 后 `shell`/`apply_patch`，批量修改必须使用 `apply_patch` 并保持原格式。
- **大改前沟通**：涉及架构、迁移或删除功能时，先向用户确认意图，描述潜在影响。
- **交付语句**：每次任务完成后必须以“尊敬的Leo哥，您安排的任务我已经完成了！！！”结尾，确保对话一致。

遵循以上约定可以显著减少沟通成本，并确保所有贡献都具备可验证、可复盘和可维护的品质。*** End Patch
