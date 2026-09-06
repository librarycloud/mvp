import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/login", component: () => import("../views/LoginView.vue") }, { path: "/", component: () => import("../views/ShellView.vue"), children: [
    { path: "", component: () => import("../views/DashboardView.vue") }, { path: "accounts", component: () => import("../views/AccountsView.vue") },
    { path: "bank", component: () => import("../views/BankView.vue") }, { path: "invoices", component: () => import("../views/InvoiceView.vue") },
    { path: "sales-invoice-requests", component: () => import("../views/SalesInvoiceRequestsView.vue") },
    { path: "bank-reconciliations", component: () => import("../views/BankReconciliationView.vue") },
    { path: "vouchers", component: () => import("../views/VoucherView.vue") }, { path: "ledgers", component: () => import("../views/LedgerView.vue") }, { path: "reports", component: () => import("../views/ReportsView.vue") },
    { path: "report-templates", component: () => import("../views/ReportTemplatesView.vue") },
    { path: "tax", component: () => import("../views/TaxView.vue") },
    { path: "company-profile", component: () => import("../views/CompanyProfileView.vue"), meta: { title: "企业资料" } },
    { path: "accounting-periods", component: () => import("../views/AccountingPeriodsView.vue"), meta: { title: "会计期间" } },
    { path: "dictionary", component: () => import("../views/DictionaryView.vue") },
    { path: "attachments/:id", component: () => import("../views/AttachmentRelationsView.vue") },
    { path: "fixed-assets", component: () => import("../views/FixedAssetsView.vue") },
    { path: "depreciation", component: () => import("../views/DepreciationView.vue") },
    { path: "ar-ap", component: () => import("../views/ArApView.vue") },
    { path: "dimensions", component: () => import("../views/DimensionsView.vue"), meta: { title: "结构化辅助核算" } },
    { path: "budgets", component: () => import("../views/BudgetView.vue"), meta: { title: "预算与费用管控" } },
    { path: "reimbursements", component: () => import("../views/ReimbursementView.vue") },
    { path: "salaries", component: () => import("../views/SalaryView.vue") },
    { path: "year-end-closing", component: () => import("../views/YearEndClosingView.vue") },
    { path: "users", component: () => import("../views/UsersView.vue"), meta: { title: "用户与会话设置" } },
    { path: "audits", component: () => import("../views/AuditView.vue"), meta: { title: "审计中心" } },
  ] }],
});
router.beforeEach((to) => {
  if (to.path !== "/login" && !localStorage.getItem("finance_access_token")) return "/login";
  if (to.path === "/login" && localStorage.getItem("finance_access_token")) return "/";
});
