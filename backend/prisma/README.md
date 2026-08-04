# Prisma data model

This module defines the accounting system's persistent model. MariaDB uses Prisma's
`mysql` provider.

## Invariants enforced by services and transactions

- Every query excludes rows whose `deleted_at` is not null unless explicitly restoring data.
- The application maintains exactly one active `company_profiles` row.
- A reviewed voucher is immutable until it is unreviewed by an administrator.
- Each voucher entry has exactly one positive side: debit or credit.
- `Voucher.totalDebit` equals `Voucher.totalCredit` and both equal the active entry totals.
- Voucher numbers are allocated atomically from `voucher_sequences` as `YYYY-NNNNNN`.
- `voucher_sources` has exactly one source reference populated.
- AI suggestions may propose accounts and summaries only. Amounts are copied from verified source data and calculated by application services.
- Ledgers and reports read only reviewed voucher entries; report snapshots are derived data and are never an accounting source.
- Report formulas are evaluated from configured mappings and dependencies. Cycles and cross-template references are rejected by the report template service.

Database-level checks and the initial chart-of-accounts/report-template seed data are added
in the migration module, which follows this schema module.

## Migration

The initial migration is in `migrations/20260713190000_initial`. Use MariaDB 10.11 LTS or
newer so every `CHECK` constraint is enforced consistently.

```bash
cp .env.example .env
npm run test:migration
npx prisma migrate deploy
```

`test:migration` is an offline structural check. `prisma migrate deploy` is the required
integration check and must be run against the target MariaDB instance before release.
