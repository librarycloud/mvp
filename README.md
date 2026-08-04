# 企业财务管理 MVP

面向中国企业财务场景的前后端一体化管理系统，覆盖凭证、账簿、银行流水、发票、报销、税务、预算、固定资产、往来款和财务报表等日常工作。

## 技术栈

- 前端：Vue 3、TypeScript、Vite、Element Plus、Pinia
- 后端：Node.js、TypeScript、Fastify、Prisma
- 数据库：MariaDB 10.11+
- 测试：Vitest

## 主要功能

- 用户认证、角色权限与审计记录
- 会计科目、凭证、会计期间及年末结账
- 总账、明细账、科目余额和试算平衡
- 银行流水导入、银企直连配置与银行对账
- 发票导入、销项开票申请和报销管理
- 应收应付、辅助核算、预算与费用控制
- 固定资产、折旧、工资和税务管理
- 资产负债表、利润表、现金流量表及所有者权益变动表
- 可选的 AI 凭证建议

## 环境要求

- Node.js 24 LTS 或更高版本
- npm 11 或兼容版本
- MariaDB 10.11 LTS 或更高版本

## 本地启动

### 1. 配置并启动后端

```bash
cd backend
npm install
cp .env.example .env
```

编辑 `.env`，至少设置以下项目：

- `DATABASE_URL`：MariaDB 连接地址
- `JWT_SECRET`：不少于 32 个字符的随机字符串
- `ADMIN_USERNAME`：初始管理员用户名
- `ADMIN_PASSWORD`：初始管理员强密码

初始化数据库和基础数据：

```bash
npm run prisma:generate
npx prisma migrate deploy
npm run seed:admin
npm run seed:accounts
npm run seed:reports
```

启动后端开发服务：

```bash
npm run dev
```

后端默认运行于 `http://127.0.0.1:3000`，OpenAPI 文档位于 `http://127.0.0.1:3000/docs`。

### 2. 启动前端

打开另一个终端：

```bash
cd frontend
npm install
npm run dev
```

前端默认运行于 `http://127.0.0.1:5173`，开发代理会将 `/api` 请求转发至后端的 `3000` 端口。

## 可选配置

- 设置 `OPENAI_API_KEY` 和 `AI_MODEL` 后启用 AI 凭证建议；`OPENAI_BASE_URL` 可用于兼容服务。
- 导出中文 PDF 时，通过 `PDF_FONT_PATH` 指定可用的中文字体文件。
- `UPLOAD_DIR` 用于配置上传文件的本地存储目录。
- 招商银行接口的密钥配置通过系统界面维护，不应提交到 Git。
- 前端可使用 `VITE_API_BASE` 覆盖默认的 `/api/v1`，使用 `VITE_TIME_ZONE` 覆盖默认的 `Asia/Shanghai`。

## 验证命令

后端：

```bash
cd backend
npm test
npm run typecheck
npm run build
npm run test:migration
```

前端：

```bash
cd frontend
npm run typecheck
npm run build
```

## 项目结构

```text
.
|-- backend/             Fastify API、Prisma 数据模型和测试
|   |-- assets/          程序使用的空白报表模板
|   |-- prisma/          数据模型与迁移
|   |-- scripts/         初始化和校验脚本
|   |-- src/             后端源码
|   `-- tests/           单元测试与接口测试
|-- frontend/            Vue 管理端
|   `-- src/             页面、组件、状态和请求封装
`-- README.md
```

## 数据安全

- `.env`、本地数据库、上传目录、依赖和构建产物不会提交到仓库。
- 测试数据使用明确的虚构占位值，不应复制真实客户、员工、银行或发票数据。
- 启用 AI 功能时，来源快照会发送到所配置的模型服务，请根据组织的数据政策配置和使用。

更多后端接口和业务规则参见 [`backend/README.md`](backend/README.md)。
