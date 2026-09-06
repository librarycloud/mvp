import fastifyJwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import type { AppConfig } from "./config/app-config.js";
import { loadConfig } from "./config/app-config.js";
import { registerErrorHandler } from "./common/http/error-handler.js";
import { sendSuccess } from "./common/http/response.js";
import { createPrismaClient } from "./infrastructure/database/prisma.js";
import { LocalFileStorage, type FileStorage } from "./infrastructure/storage/file-storage.js";
import { AccountController } from "./modules/account/account.controller.js";
import type { AccountRepository } from "./modules/account/account.repository.js";
import { PrismaAccountRepository } from "./modules/account/account.repository.js";
import { accountRoutes } from "./modules/account/account.routes.js";
import { AccountService } from "./modules/account/account.service.js";
import { AiSuggestionController } from "./modules/ai-suggestion/ai-suggestion.controller.js";
import type { AiSuggestionRepository } from "./modules/ai-suggestion/ai-suggestion.repository.js";
import { PrismaAiSuggestionRepository } from "./modules/ai-suggestion/ai-suggestion.repository.js";
import { aiSuggestionRoutes } from "./modules/ai-suggestion/ai-suggestion.routes.js";
import { AiSuggestionService } from "./modules/ai-suggestion/ai-suggestion.service.js";
import {
  OpenAiVoucherSuggestionProvider,
  UnconfiguredVoucherSuggestionProvider,
  type VoucherSuggestionProvider,
} from "./modules/ai-suggestion/voucher-suggestion.provider.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import type { AuthRepository } from "./modules/auth/auth.repository.js";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { BcryptPasswordHasher } from "./modules/auth/password-hasher.js";
import { JwtTokenService } from "./modules/auth/token-service.js";
import { BankFileParser } from "./modules/bank-transaction/bank-file-parser.js";
import { BankTransactionController } from "./modules/bank-transaction/bank-transaction.controller.js";
import type { BankTransactionRepository } from "./modules/bank-transaction/bank-transaction.repository.js";
import { PrismaBankTransactionRepository } from "./modules/bank-transaction/bank-transaction.repository.js";
import { bankTransactionRoutes } from "./modules/bank-transaction/bank-transaction.routes.js";
import { BankTransactionService } from "./modules/bank-transaction/bank-transaction.service.js";
import { CmbFetchConfigService } from "./modules/bank-transaction/cmb-fetch-config.service.js";
import { BankReconciliationController } from "./modules/bank-reconciliation/bank-reconciliation.controller.js";
import { BankReconciliationService } from "./modules/bank-reconciliation/bank-reconciliation.service.js";
import { bankReconciliationRoutes } from "./modules/bank-reconciliation/bank-reconciliation.routes.js";
import { InvoiceController } from "./modules/invoice/invoice.controller.js";
import type { InvoiceRepository } from "./modules/invoice/invoice.repository.js";
import { PrismaInvoiceRepository } from "./modules/invoice/invoice.repository.js";
import { invoiceRoutes } from "./modules/invoice/invoice.routes.js";
import { InvoiceService } from "./modules/invoice/invoice.service.js";
import { XmlInvoiceParser } from "./modules/invoice/xml-invoice-parser.js";
import { PrismaVoucherRepository } from "./modules/voucher/prisma-voucher.repository.js";
import type { VoucherRepository } from "./modules/voucher/voucher.repository.js";
import { VoucherController } from "./modules/voucher/voucher.controller.js";
import { voucherRoutes } from "./modules/voucher/voucher.routes.js";
import { VoucherService } from "./modules/voucher/voucher.service.js";
import { GeneralLedgerController } from "./modules/general-ledger/general-ledger.controller.js";
import type { GeneralLedgerRepository } from "./modules/general-ledger/general-ledger.repository.js";
import { PrismaGeneralLedgerRepository } from "./modules/general-ledger/general-ledger.repository.js";
import { generalLedgerRoutes } from "./modules/general-ledger/general-ledger.routes.js";
import { GeneralLedgerService } from "./modules/general-ledger/general-ledger.service.js";
import { DetailLedgerController } from "./modules/detail-ledger/detail-ledger.controller.js";
import type { DetailLedgerRepository } from "./modules/detail-ledger/detail-ledger.repository.js";
import { PrismaDetailLedgerRepository } from "./modules/detail-ledger/detail-ledger.repository.js";
import { detailLedgerRoutes } from "./modules/detail-ledger/detail-ledger.routes.js";
import { DetailLedgerService } from "./modules/detail-ledger/detail-ledger.service.js";
import { AccountBalanceController } from "./modules/account-balance/account-balance.controller.js";
import type { AccountBalanceRepository } from "./modules/account-balance/account-balance.repository.js";
import { PrismaAccountBalanceRepository } from "./modules/account-balance/account-balance.repository.js";
import { accountBalanceRoutes } from "./modules/account-balance/account-balance.routes.js";
import { AccountBalanceService } from "./modules/account-balance/account-balance.service.js";
import { TrialBalanceController } from "./modules/trial-balance/trial-balance.controller.js";
import type { TrialBalanceRepository } from "./modules/trial-balance/trial-balance.repository.js";
import { PrismaTrialBalanceRepository } from "./modules/trial-balance/trial-balance.repository.js";
import { trialBalanceRoutes } from "./modules/trial-balance/trial-balance.routes.js";
import { TrialBalanceService } from "./modules/trial-balance/trial-balance.service.js";
import { ReportController } from "./modules/report/report.controller.js";
import type { ReportRepository } from "./modules/report/report.repository.js";
import { PrismaReportRepository } from "./modules/report/report.repository.js";
import { reportRoutes } from "./modules/report/report.routes.js";
import { ReportService } from "./modules/report/report.service.js";
import { ReportExportService } from "./modules/report/report-export.service.js";
import { ReportTemplateController } from "./modules/report-template/report-template.controller.js";
import { reportTemplateRoutes } from "./modules/report-template/report-template.routes.js";
import { ReportTemplateService } from "./modules/report-template/report-template.service.js";
import { AccountingPeriodController } from "./modules/accounting-period/accounting-period.controller.js";
import type { AccountingPeriodRepository } from "./modules/accounting-period/accounting-period.types.js";
import { PrismaAccountingPeriodRepository } from "./modules/accounting-period/accounting-period.repository.js";
import { AccountingPeriodService } from "./modules/accounting-period/accounting-period.service.js";
import { accountingPeriodRoutes } from "./modules/accounting-period/accounting-period.routes.js";
import { PrismaPeriodCloseChecker } from "./modules/accounting-period/period-close-checker.js";
import { DictionaryController } from "./modules/dictionary/dictionary.controller.js";
import type { DictionaryRepository } from "./modules/dictionary/dictionary.types.js";
import { PrismaDictionaryRepository } from "./modules/dictionary/dictionary.repository.js";
import { DictionaryService } from "./modules/dictionary/dictionary.service.js";
import { dictionaryRoutes } from "./modules/dictionary/dictionary.routes.js";
import { AttachmentRelationController } from "./modules/attachment-relation/attachment-relation.controller.js";
import type { AttachmentRepository } from "./modules/attachment-relation/attachment-relation.types.js";
import { PrismaAttachmentRepository } from "./modules/attachment-relation/attachment-relation.repository.js";
import { AttachmentRelationService } from "./modules/attachment-relation/attachment-relation.service.js";
import { attachmentRelationRoutes } from "./modules/attachment-relation/attachment-relation.routes.js";
import { FixedAssetController } from "./modules/fixed-asset/fixed-asset.controller.js";
import { FixedAssetService } from "./modules/fixed-asset/fixed-asset.service.js";
import { fixedAssetRoutes } from "./modules/fixed-asset/fixed-asset.routes.js";
import { ArApController } from "./modules/ar-ap/ar-ap.controller.js";
import { ArApService } from "./modules/ar-ap/ar-ap.service.js";
import { arApRoutes } from "./modules/ar-ap/ar-ap.routes.js";
import { SalaryController } from "./modules/salary/salary.controller.js";
import { SalaryService } from "./modules/salary/salary.service.js";
import { salaryRoutes } from "./modules/salary/salary.routes.js";
import { YearEndClosingController } from "./modules/year-end-closing/year-end-closing.controller.js";
import { YearEndClosingService } from "./modules/year-end-closing/year-end-closing.service.js";
import { yearEndClosingRoutes } from "./modules/year-end-closing/year-end-closing.routes.js";
import { DepreciationController } from "./modules/depreciation/depreciation.controller.js";
import { DepreciationService } from "./modules/depreciation/depreciation.service.js";
import { depreciationRoutes } from "./modules/depreciation/depreciation.routes.js";
import { CompanyProfileController } from "./modules/company-profile/company-profile.controller.js";
import { CompanyProfileService } from "./modules/company-profile/company-profile.service.js";
import { companyProfileRoutes } from "./modules/company-profile/company-profile.routes.js";
import { ReimbursementController } from "./modules/reimbursement/reimbursement.controller.js";
import { reimbursementRoutes } from "./modules/reimbursement/reimbursement.routes.js";
import { ReimbursementService } from "./modules/reimbursement/reimbursement.service.js";
import { TaxController } from "./modules/tax/tax.controller.js";
import { taxRoutes } from "./modules/tax/tax.routes.js";
import { TaxService } from "./modules/tax/tax.service.js";
import { UserController } from "./modules/user/user.controller.js";
import { userRoutes } from "./modules/user/user.routes.js";
import { UserService } from "./modules/user/user.service.js";
import { AuditController } from "./modules/audit/audit.controller.js";
import { auditRoutes } from "./modules/audit/audit.routes.js";
import { AuditService } from "./modules/audit/audit.service.js";
import { DimensionController } from "./modules/dimension/dimension.controller.js";
import { DimensionService } from "./modules/dimension/dimension.service.js";
import { dimensionRoutes } from "./modules/dimension/dimension.routes.js";
import { BudgetController } from "./modules/budget/budget.controller.js";
import { BudgetService } from "./modules/budget/budget.service.js";
import { budgetRoutes } from "./modules/budget/budget.routes.js";

export interface BuildAppOptions {
  config?: AppConfig;
  authRepository?: AuthRepository;
  accountRepository?: AccountRepository;
  bankTransactionRepository?: BankTransactionRepository;
  invoiceRepository?: InvoiceRepository;
  aiSuggestionRepository?: AiSuggestionRepository;
  voucherSuggestionProvider?: VoucherSuggestionProvider;
  voucherRepository?: VoucherRepository;
  generalLedgerRepository?: GeneralLedgerRepository;
  detailLedgerRepository?: DetailLedgerRepository;
  accountBalanceRepository?: AccountBalanceRepository;
  trialBalanceRepository?: TrialBalanceRepository;
  reportRepository?: ReportRepository;
  accountingPeriodRepository?: AccountingPeriodRepository;
  dictionaryRepository?: DictionaryRepository;
  attachmentRepository?: AttachmentRepository;
  fileStorage?: FileStorage;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({ logger: options.logger ?? config.nodeEnv !== "test" });

  await app.register(swagger, {
    openapi: {
      info: { title: "中国企业财务系统 API", version: "0.1.0" },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    verify: { allowedIss: config.jwtIssuer, allowedAud: config.jwtAudience },
  });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 10 } });

  let authRepository = options.authRepository;
  let accountRepository = options.accountRepository;
  let bankTransactionRepository = options.bankTransactionRepository;
  let invoiceRepository = options.invoiceRepository;
  let aiSuggestionRepository = options.aiSuggestionRepository;
  let voucherRepository = options.voucherRepository;
  let generalLedgerRepository = options.generalLedgerRepository;
  let detailLedgerRepository = options.detailLedgerRepository;
  let accountBalanceRepository = options.accountBalanceRepository;
  let trialBalanceRepository = options.trialBalanceRepository;
  let reportRepository = options.reportRepository;
  let accountingPeriodRepository = options.accountingPeriodRepository;
  let dictionaryRepository = options.dictionaryRepository;
  let attachmentRepository = options.attachmentRepository;
  let databasePrisma: ReturnType<typeof createPrismaClient> | undefined;
  if (
    !authRepository ||
    !accountRepository ||
    !bankTransactionRepository ||
    !invoiceRepository ||
    !aiSuggestionRepository ||
    !voucherRepository ||
    !generalLedgerRepository ||
    !detailLedgerRepository ||
    !accountBalanceRepository ||
    !trialBalanceRepository ||
    !reportRepository ||
    !accountingPeriodRepository ||
    !dictionaryRepository ||
    !attachmentRepository
  ) {
    const prisma = databasePrisma = createPrismaClient(config.databaseUrl);
    authRepository ??= new PrismaAuthRepository(prisma);
    accountRepository ??= new PrismaAccountRepository(prisma);
    bankTransactionRepository ??= new PrismaBankTransactionRepository(prisma);
    invoiceRepository ??= new PrismaInvoiceRepository(prisma);
    aiSuggestionRepository ??= new PrismaAiSuggestionRepository(prisma);
    voucherRepository ??= new PrismaVoucherRepository(prisma);
    generalLedgerRepository ??= new PrismaGeneralLedgerRepository(prisma);
    detailLedgerRepository ??= new PrismaDetailLedgerRepository(prisma);
    accountBalanceRepository ??= new PrismaAccountBalanceRepository(prisma);
    trialBalanceRepository ??= new PrismaTrialBalanceRepository(prisma);
    reportRepository ??= new PrismaReportRepository(prisma);
    accountingPeriodRepository ??= new PrismaAccountingPeriodRepository(prisma);
    dictionaryRepository ??= new PrismaDictionaryRepository(prisma);
    attachmentRepository ??= new PrismaAttachmentRepository(prisma);
    app.addHook("onClose", () => prisma.$disconnect());
  }

  const tokenService = new JwtTokenService({
    secret: config.jwtSecret,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
  });
  const authService = new AuthService(authRepository, new BcryptPasswordHasher(), tokenService);
  const authController = new AuthController(authService);
  const modulePrisma = databasePrisma ?? createPrismaClient(config.databaseUrl);
  if (!databasePrisma) app.addHook("onClose", () => modulePrisma.$disconnect());
  const accountController = new AccountController(new AccountService(accountRepository));
  const bankTransactionController = new BankTransactionController(
    new BankTransactionService(
      bankTransactionRepository,
      new BankFileParser(),
      options.fileStorage ?? new LocalFileStorage(config.uploadDir),
      !options.bankTransactionRepository || options.accountingPeriodRepository ? accountingPeriodRepository : undefined,
      undefined,
      config.cmbApiAllowedHosts,
    ),
    new CmbFetchConfigService(modulePrisma, config.jwtSecret),
  );
  const invoiceController = new InvoiceController(
    new InvoiceService(
      invoiceRepository,
      new XmlInvoiceParser(),
      options.fileStorage ?? new LocalFileStorage(config.uploadDir),
      !options.invoiceRepository || options.accountingPeriodRepository ? accountingPeriodRepository : undefined,
      modulePrisma,
    ),
  );
  const suggestionProvider =
    options.voucherSuggestionProvider ??
    (config.openAiApiKey && config.aiModel
      ? new OpenAiVoucherSuggestionProvider(
          config.aiModel,
          config.openAiApiKey,
          config.openAiBaseUrl ?? undefined,
        )
      : new UnconfiguredVoucherSuggestionProvider());
  const aiSuggestionController = new AiSuggestionController(
    new AiSuggestionService(aiSuggestionRepository, suggestionProvider),
  );
  const voucherController = new VoucherController(
    new VoucherService(
      voucherRepository,
      options.fileStorage ?? new LocalFileStorage(config.uploadDir),
      !options.voucherRepository || options.accountingPeriodRepository
        ? new AccountingPeriodService(accountingPeriodRepository)
        : undefined,
    ),
  );
  const userController = new UserController(new UserService(modulePrisma, new BcryptPasswordHasher()));
  const accountingPeriodController = new AccountingPeriodController(
    new AccountingPeriodService(
      accountingPeriodRepository,
      options.accountingPeriodRepository ? undefined : new PrismaPeriodCloseChecker(modulePrisma),
    ),
  );
  const dictionaryService = new DictionaryService(dictionaryRepository);
  if (!options.dictionaryRepository && !options.authRepository) await dictionaryService.warmup();
  else if (options.dictionaryRepository) await dictionaryService.warmup();
  const dictionaryController = new DictionaryController(dictionaryService);
  const attachmentRelationController = new AttachmentRelationController(new AttachmentRelationService(attachmentRepository!, options.fileStorage ?? new LocalFileStorage(config.uploadDir)));
  const accountingPeriodService = new AccountingPeriodService(accountingPeriodRepository);
  const fixedAssetController = new FixedAssetController(new FixedAssetService(modulePrisma, accountingPeriodService));
  const arApController = new ArApController(new ArApService(modulePrisma, accountingPeriodService));
  const salaryController = new SalaryController(new SalaryService(modulePrisma, accountingPeriodService));
  const yearEndClosingController = new YearEndClosingController(new YearEndClosingService(modulePrisma));
  const depreciationController = new DepreciationController(new DepreciationService(modulePrisma, accountingPeriodService));
  const companyProfileController = new CompanyProfileController(new CompanyProfileService(modulePrisma));
  const budgetService = new BudgetService(modulePrisma);
  const reimbursementController = new ReimbursementController(new ReimbursementService(modulePrisma, accountingPeriodService, budgetService));
  const bankReconciliationController = new BankReconciliationController(new BankReconciliationService(modulePrisma));
  const generalLedgerController = new GeneralLedgerController(
    new GeneralLedgerService(generalLedgerRepository),
  );
  const detailLedgerController = new DetailLedgerController(new DetailLedgerService(detailLedgerRepository));
  const accountBalanceController = new AccountBalanceController(
    new AccountBalanceService(accountBalanceRepository),
  );
  const trialBalanceController = new TrialBalanceController(new TrialBalanceService(trialBalanceRepository));
  const reportService = new ReportService(reportRepository);
  const reportController = new ReportController(reportService, new ReportExportService(reportService, config.pdfFontPath ?? null, modulePrisma));
  const reportTemplateController = new ReportTemplateController(new ReportTemplateService(modulePrisma));
  const taxController = new TaxController(new TaxService(modulePrisma, accountingPeriodService));
  const auditController = new AuditController(new AuditService(modulePrisma));
  const dimensionController = new DimensionController(new DimensionService(modulePrisma));
  const budgetController = new BudgetController(budgetService);

  registerErrorHandler(app);
  app.get("/health", async (_request, reply) => sendSuccess(reply, { status: "ok" }));
  await app.register(authRoutes, { prefix: "/api/v1/auth", controller: authController });
  await app.register(userRoutes, { prefix: "/api/v1/users", controller: userController });
  await app.register(auditRoutes, { prefix: "/api/v1/audits", controller: auditController });
  await app.register(dimensionRoutes, { prefix: "/api/v1/dimensions", controller: dimensionController });
  await app.register(budgetRoutes, { prefix: "/api/v1/budgets", controller: budgetController });
  await app.register(accountRoutes, { prefix: "/api/v1/accounts", controller: accountController });
  await app.register(bankTransactionRoutes, {
    prefix: "/api/v1/bank-transactions",
    controller: bankTransactionController,
  });
  await app.register(bankReconciliationRoutes, { prefix: "/api/v1/bank-reconciliations", controller: bankReconciliationController });
  await app.register(invoiceRoutes, { prefix: "/api/v1/invoices", controller: invoiceController });
  await app.register(aiSuggestionRoutes, {
    prefix: "/api/v1/ai/voucher-suggestions",
    controller: aiSuggestionController,
  });
  await app.register(voucherRoutes, { prefix: "/api/v1/vouchers", controller: voucherController });
  await app.register(reportTemplateRoutes, { prefix: "/api/v1/report-templates", controller: reportTemplateController });
  await app.register(taxRoutes, { prefix: "/api/v1/tax", controller: taxController });
  await app.register(accountingPeriodRoutes, { prefix: "/api/v1/accounting-periods", controller: accountingPeriodController });
  await app.register(dictionaryRoutes, { prefix: "/api/v1/dictionary", controller: dictionaryController });
  await app.register(attachmentRelationRoutes, { prefix: "/api/v1/attachments", controller: attachmentRelationController });
  await app.register(fixedAssetRoutes, { prefix: "/api/v1/fixed-assets", controller: fixedAssetController });
  await app.register(arApRoutes, { prefix: "/api/v1/ar-ap", controller: arApController });
  await app.register(salaryRoutes, { prefix: "/api/v1/salaries", controller: salaryController });
  await app.register(yearEndClosingRoutes, { prefix: "/api/v1/year-end-closings", controller: yearEndClosingController });
  await app.register(depreciationRoutes, { prefix: "/api/v1/depreciations", controller: depreciationController });
  await app.register(companyProfileRoutes, { prefix: "/api/v1/company-profile", controller: companyProfileController });
  await app.register(reimbursementRoutes, { prefix: "/api/v1/reimbursements", controller: reimbursementController });
  await app.register(generalLedgerRoutes, {
    prefix: "/api/v1/general-ledger",
    controller: generalLedgerController,
  });
  await app.register(detailLedgerRoutes, {
    prefix: "/api/v1/detail-ledger",
    controller: detailLedgerController,
  });
  await app.register(accountBalanceRoutes, {
    prefix: "/api/v1/account-balances",
    controller: accountBalanceController,
  });
  await app.register(trialBalanceRoutes, {
    prefix: "/api/v1/trial-balance",
    controller: trialBalanceController,
  });
  await app.register(reportRoutes, { prefix: "/api/v1/reports", controller: reportController });

  return app;
}
