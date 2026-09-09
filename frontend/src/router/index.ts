import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/login", component: () => import("../views/LoginView.vue") }, { path: "/", component: () => import("../views/ShellView.vue"), children: [
    { path: "", component: () => import("../views/DashboardView.vue"), meta: { title: "工作台" } },
    { path: "accounts", component: () => import("../views/AccountsView.vue"), meta: { title: "会计科目" } },
    { path: "bank", component: () => import("../views/BankView.vue"), meta: { title: "银行流水" } },
    { path: "invoices", component: () => import("../views/InvoiceView.vue"), meta: { title: "电子发票" } },
    { path: "sales-invoice-requests", component: () => import("../views/SalesInvoiceRequestsView.vue"), meta: { title: "销项开票" } },
    { path: "bank-reconciliations", component: () => import("../views/BankReconciliationView.vue"), meta: { title: "银行对账" } },
    { path: "vouchers", component: () => import("../views/VoucherView.vue"), meta: { title: "凭证管理" } },
    { path: "ledgers", component: () => import("../views/LedgerView.vue"), meta: { title: "账簿明细" } },
    { path: "reports", component: () => import("../views/ReportsView.vue"), meta: { title: "财务报表" } },
    { path: "report-templates", component: () => import("../views/ReportTemplatesView.vue"), meta: { title: "报表模板" } },
    { path: "tax", component: () => import("../views/TaxView.vue"), meta: { title: "税务申报" } },
    { path: "company-profile", component: () => import("../views/CompanyProfileView.vue"), meta: { title: "企业资料" } },
    { path: "accounting-periods", component: () => import("../views/AccountingPeriodsView.vue"), meta: { title: "会计期间" } },
    { path: "dictionary", component: () => import("../views/DictionaryView.vue"), meta: { title: "数据字典" } },
    { path: "attachments/:id", component: () => import("../views/AttachmentRelationsView.vue"), meta: { title: "附件管理" } },
    { path: "fixed-assets", component: () => import("../views/FixedAssetsView.vue"), meta: { title: "固定资产" } },
    { path: "depreciation", component: () => import("../views/DepreciationView.vue"), meta: { title: "自动折旧" } },
    { path: "ar-ap", component: () => import("../views/ArApView.vue"), meta: { title: "往来管理" } },
    { path: "dimensions", component: () => import("../views/DimensionsView.vue"), meta: { title: "辅助核算" } },
    { path: "budgets", component: () => import("../views/BudgetView.vue"), meta: { title: "预算与费控" } },
    { path: "reimbursements", component: () => import("../views/ReimbursementView.vue"), meta: { title: "费用报销" } },
    { path: "salaries", component: () => import("../views/SalaryView.vue"), meta: { title: "工资管理" } },
    { path: "year-end-closing", component: () => import("../views/YearEndClosingView.vue"), meta: { title: "年末结转" } },
    { path: "users", component: () => import("../views/UsersView.vue"), meta: { title: "用户与会话" } },
    { path: "audits", component: () => import("../views/AuditView.vue"), meta: { title: "审计中心" } },
  ] }],
});
router.beforeEach((to) => {
  if (to.path !== "/login" && !localStorage.getItem("finance_access_token")) return "/login";
  if (to.path === "/login" && localStorage.getItem("finance_access_token")) return "/";
});
