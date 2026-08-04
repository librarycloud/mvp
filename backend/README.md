# China Finance MVP Backend

## Requirements

- Node.js 24 LTS
- MariaDB 10.11 LTS or newer

## Local setup

1. Copy `.env.example` to `.env` and replace every placeholder secret.
2. Run `npm install`.
3. Run `npx prisma migrate deploy`.
4. Set a strong `ADMIN_PASSWORD` and run `npm run seed:admin`.
5. Run `npm run seed:accounts` to install the standard chart of accounts.
6. Run `npm run seed:reports` to install the configured income statement template.
7. Run `npm run dev`.

The API listens on `http://127.0.0.1:3000` by default. OpenAPI documentation is served
at `/docs`.

## Authentication API

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

## Account API

- `GET /api/v1/accounts`
- `GET /api/v1/accounts/:id`
- `POST /api/v1/accounts` (administrator)
- `PUT /api/v1/accounts/:id` (administrator)
- `DELETE /api/v1/accounts/:id` (administrator)

## Dictionary API

- `GET /api/v1/dictionary`
- `GET /api/v1/dictionary/:code`
- `GET /api/v1/dictionary/categories/:code`
- `POST /api/v1/dictionary/categories` (administrator)
- `PUT /api/v1/dictionary/categories/:id` (administrator)
- `POST /api/v1/dictionary/:code/items` (administrator)
- `PUT /api/v1/dictionary/items/:id` (administrator)
- `DELETE /api/v1/dictionary/items/:id` (administrator)

Dictionary categories and items are warmed into the application cache at startup. Dictionary writes
refresh that cache before returning, so downstream modules can depend on `DictionaryService` without
querying dictionary tables directly.

## Bank transaction API

- `POST /api/v1/bank-transactions/import` (`multipart/form-data`, field `file`)
- `GET /api/v1/bank-transactions`
- `GET /api/v1/bank-transactions/:id`

## Invoice API

- `POST /api/v1/invoices/import/xml` (`multipart/form-data`, field `file`)
- `GET /api/v1/invoices`
- `GET /api/v1/invoices/:id`

## AI voucher suggestion API

- `POST /api/v1/ai/voucher-suggestions`
- `GET /api/v1/ai/voucher-suggestions/:id`
- `POST /api/v1/ai/voucher-suggestions/:id/reject`

Set both `OPENAI_API_KEY` and `AI_MODEL` to enable the production provider. `OPENAI_BASE_URL`
is optional. Source snapshots are sent to the configured endpoint. The model output schema
contains only voucher summary, debit/credit direction, account code, and rationale; amounts
are never accepted from the model.

## Voucher API

- `POST /api/v1/vouchers`
- `POST /api/v1/vouchers/from-ai/:suggestionId`
- `GET /api/v1/vouchers`
- `GET /api/v1/vouchers/:id`
- `PUT /api/v1/vouchers/:id`
- `DELETE /api/v1/vouchers/:id`
- `POST /api/v1/vouchers/:id/review` (administrator)
- `POST /api/v1/vouchers/:id/unreview` (administrator)
- `POST /api/v1/vouchers/:id/attachments`

Voucher lifecycle endpoints:

- `POST /api/v1/vouchers/:id/submit` (draft to pending)
- `POST /api/v1/vouchers/:id/review` (administrator)
- `POST /api/v1/vouchers/:id/unreview` (administrator)
- `POST /api/v1/vouchers/:id/post` (administrator)
- `POST /api/v1/vouchers/:id/unpost` (administrator)
- `POST /api/v1/vouchers/:id/void` (administrator, body: `{ "reason": "..." }`)
- `POST /api/v1/vouchers/:id/restore` (administrator)

Only `POSTED` vouchers are included in ledgers, balances, trial balance, and financial reports.
The delete endpoint is retained only for compatibility and rejects every request; use void instead.

`postingDate` is optional when creating or updating a voucher. It defaults to `voucherDate`.
The posting date selects the accounting period and a closed period rejects create, update, delete,
review, and unreview operations.

## Accounting Period API

- `GET /api/v1/accounting-periods`
- `POST /api/v1/accounting-periods` (administrator)
- `POST /api/v1/accounting-periods/:id/close` (administrator)
- `POST /api/v1/accounting-periods/:id/reopen` (administrator)

Deploy the new migration with `npx prisma migrate deploy`. It backfills `posting_date` from each
existing voucher date, creates the required monthly accounting periods, and assigns existing
vouchers to their matching `period_id` without changing voucher entries or reports.

## General Ledger API

- `GET /api/v1/general-ledger?accountId=<uuid>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

The general ledger is read-only and derives opening balance, period movement, and rolling
balances exclusively from reviewed voucher entries.

## Detail Ledger API

- `GET /api/v1/detail-ledger?accountId=<uuid>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Optionally include both `auxiliaryKey` and `auxiliaryValue` to calculate opening, period,
and closing balances for one auxiliary-accounting dimension.

## Account Balance API

- `GET /api/v1/account-balances?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Use `includeZero=false` to hide fully zero accounts. Parent-account rows aggregate their
posted child accounts from reviewed voucher entries.

## Trial Balance API

- `GET /api/v1/trial-balance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

The trial balance uses direct-posting accounts only, checks opening/period/closing debit-credit
totals independently, and avoids double-counting parent-account rollups.

## Report API

- `POST /api/v1/reports/generate`
- `POST /api/v1/reports/income-statement/generate`
- `POST /api/v1/reports/balance-sheet/generate`
- `POST /api/v1/reports/cash-flow-statement/generate`
- `GET /api/v1/reports/:id`

The stored profit-report lines use `currentAmount` for the requested period and `closingAmount`
for year-to-date amount. Templates, account mappings, aggregation direction, formula dependencies,
and order are database configuration, not report-service constants.

For cash-flow templates, `openingAmount` and `closingAmount` hold configured balance-mapping
amounts (such as beginning/ending cash), while `currentAmount` holds configured period flows.

Access tokens are short-lived JWTs. Refresh tokens are rotated on every refresh and only
their SHA-256 hashes are stored. Send access tokens as `Authorization: Bearer <token>`.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm run test:migration
```
