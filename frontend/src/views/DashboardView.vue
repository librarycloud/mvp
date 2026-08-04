<script setup lang="ts">
import { computed, onMounted, ref, type Component } from "vue";
import {
  DataAnalysis,
  Document,
  DocumentAdd,
  DocumentChecked,
  Finished,
  Refresh,
  UploadFilled,
  Wallet,
  WalletFilled,
} from "@element-plus/icons-vue";
import { api } from "../utils/api";
import { formatBusinessDate, todayBusinessDate } from "../utils/date";
import { useAuthStore } from "../stores/auth";

interface DashboardAction {
  label: string;
  description: string;
  path: string;
  icon: Component;
}

interface TodoItem {
  label: string;
  description: string;
  count: number;
  path: string;
  icon: Component;
  tone: "warning" | "primary" | "success";
}

const auth = useAuthStore();
const loading = ref(false);
const partialFailure = ref(false);
const pendingVoucherTotal = ref(0);
const reimbursementSummary = ref<any>({});
const reconciliations = ref<any[]>([]);
const periods = ref<any[]>([]);
const recentVouchers = ref<any[]>([]);
const refreshedAt = ref("");

const voucherStatusLabels: Record<number, string> = { 0: "草稿", 1: "待审核", 2: "已记账", 3: "作废" };
const voucherStatusTypes: Record<number, "info" | "warning" | "success" | "danger"> = { 0: "info", 1: "warning", 2: "success", 3: "danger" };
const periodStatusLabels: Record<number, string> = { 0: "进行中", 1: "已关账", 2: "已锁定" };
const periodStatusTypes: Record<number, "success" | "info" | "danger"> = { 0: "success", 1: "info", 2: "danger" };

const currentPeriod = computed(() => {
  const today = todayBusinessDate();
  return periods.value.find(row => row.startDate.slice(0, 10) <= today && row.endDate.slice(0, 10) >= today)
    ?? periods.value.find(row => row.status === 0)
    ?? periods.value[0];
});

const todos = computed<TodoItem[]>(() => [
  {
    label: auth.canManageAccounting ? "待审核凭证" : "审核中的凭证",
    description: auth.canManageAccounting ? "需要完成审核或记账" : "等待财务主管处理",
    count: pendingVoucherTotal.value,
    path: "/vouchers",
    icon: DocumentChecked,
    tone: "warning",
  },
  {
    label: auth.canManageAccounting ? "待审批报销" : "审批中的报销",
    description: auth.canManageAccounting ? "需要审批报销申请" : "已提交、等待审批",
    count: Number(reimbursementSummary.value.status1 ?? 0),
    path: "/reimbursements",
    icon: Wallet,
    tone: "primary",
  },
  {
    label: auth.canOperateCash ? "待付款报销" : "已通过待付款",
    description: auth.canOperateCash ? "审批通过，等待付款入账" : "等待出纳付款",
    count: Number(reimbursementSummary.value.status2 ?? 0),
    path: "/reimbursements",
    icon: WalletFilled,
    tone: "success",
  },
  {
    label: "进行中银行对账",
    description: auth.canOperateCash ? "存在尚未完成的对账单" : "对账单仍在处理中",
    count: reconciliations.value.length,
    path: "/bank-reconciliations",
    icon: Finished,
    tone: "primary",
  },
]);

const quickActions = computed<DashboardAction[]>(() => {
  const actions: DashboardAction[] = [
    { label: "费用报销", description: "新增或处理报销单", path: "/reimbursements", icon: WalletFilled },
    { label: "电子发票", description: "导入并管理发票", path: "/invoices", icon: Document },
    { label: "财务报表", description: "生成并查看报表", path: "/reports", icon: DataAnalysis },
  ];
  if (auth.canEditAccounting) actions.unshift({ label: "手工凭证", description: "录入会计凭证", path: "/vouchers", icon: DocumentAdd });
  if (auth.canOperateCash) actions.splice(2, 0,
    { label: "银行流水", description: "导入银行流水", path: "/bank", icon: UploadFilled },
    { label: "银行对账", description: "核对流水与分录", path: "/bank-reconciliations", icon: Finished },
  );
  return actions;
});

function money(value: unknown) { return Number(value ?? 0).toFixed(2); }
function periodRange(period: any) { return `${formatBusinessDate(period.startDate)} 至 ${formatBusinessDate(period.endDate)}`; }

async function loadDashboard() {
  loading.value = true;
  partialFailure.value = false;
  try {
    const results = await Promise.allSettled([
      api.get<any>("/vouchers?page=1&pageSize=1&status=1"),
      api.get<any>("/reimbursements/summary"),
      api.get<any[]>("/bank-reconciliations?status=0"),
      api.get<any[]>("/accounting-periods"),
      api.get<any>("/vouchers?page=1&pageSize=5"),
    ]);
    partialFailure.value = results.some(result => result.status === "rejected");
    if (results[0]?.status === "fulfilled") pendingVoucherTotal.value = results[0].value.total;
    if (results[1]?.status === "fulfilled") reimbursementSummary.value = results[1].value;
    if (results[2]?.status === "fulfilled") reconciliations.value = results[2].value;
    if (results[3]?.status === "fulfilled") periods.value = results[3].value;
    if (results[4]?.status === "fulfilled") recentVouchers.value = results[4].value.items;
    refreshedAt.value = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
  } finally {
    loading.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <div class="dashboard" v-loading="loading">
    <section class="dashboard-heading">
      <div>
        <h2>工作台</h2>
        <p>{{ auth.user?.displayName ?? "" }}，以下是当前账务概览</p>
      </div>
      <div class="dashboard-refresh">
        <span v-if="refreshedAt">更新于 {{ refreshedAt }}</span>
        <el-button circle :icon="Refresh" title="刷新工作台" aria-label="刷新工作台" @click="loadDashboard"/>
      </div>
    </section>

    <el-alert v-if="partialFailure" type="warning" :closable="false" show-icon title="部分工作台数据加载失败，请刷新后重试。"/>

    <section class="period-strip">
      <template v-if="currentPeriod">
        <div class="period-main">
          <span class="period-label">当前会计期间</span>
          <strong>{{ currentPeriod.periodCode }}</strong>
          <el-tag :type="periodStatusTypes[currentPeriod.status]">{{ periodStatusLabels[currentPeriod.status] ?? currentPeriod.status }}</el-tag>
        </div>
        <div class="period-side">
          <span>{{ periodRange(currentPeriod) }}</span>
          <RouterLink to="/accounting-periods">查看期间</RouterLink>
        </div>
      </template>
      <template v-else>
        <div class="period-main"><span class="period-label">会计期间</span><strong>尚未建立</strong></div>
        <RouterLink to="/accounting-periods">立即建立</RouterLink>
      </template>
    </section>

    <section class="dashboard-metrics" aria-label="待办汇总">
      <RouterLink v-for="item in todos" :key="item.label" :to="item.path" class="dashboard-metric">
        <div class="metric-icon" :class="`is-${item.tone}`"><el-icon><component :is="item.icon"/></el-icon></div>
        <div class="metric-copy"><span>{{ item.label }}</span><strong>{{ item.count }}</strong><small>{{ item.description }}</small></div>
      </RouterLink>
    </section>

    <div class="dashboard-columns">
      <section class="dashboard-panel todo-panel">
        <div class="panel-heading"><div><h3>待办事项</h3><span>按业务状态汇总</span></div></div>
        <div class="todo-list">
          <RouterLink v-for="item in todos" :key="`todo-${item.label}`" :to="item.path" class="todo-row">
            <div class="todo-name"><el-icon><component :is="item.icon"/></el-icon><div><strong>{{ item.label }}</strong><span>{{ item.description }}</span></div></div>
            <div class="todo-count" :class="{ empty: item.count === 0 }">{{ item.count || "已处理" }}</div>
          </RouterLink>
        </div>
      </section>

      <section class="dashboard-panel recent-panel">
        <div class="panel-heading"><div><h3>最近凭证</h3><span>最近录入的 5 张凭证</span></div><RouterLink to="/vouchers">全部凭证</RouterLink></div>
        <el-table :data="recentVouchers" size="small" empty-text="暂无凭证">
          <el-table-column prop="voucherNo" label="凭证号" min-width="130"/>
          <el-table-column label="入账日期" width="110"><template #default="{row}">{{ formatBusinessDate(row.postingDate) }}</template></el-table-column>
          <el-table-column prop="summary" label="摘要" min-width="170" show-overflow-tooltip/>
          <el-table-column label="金额" width="110" align="right"><template #default="{row}">{{ money(row.totalDebit) }}</template></el-table-column>
          <el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="voucherStatusTypes[row.status]" size="small">{{ voucherStatusLabels[row.status] }}</el-tag></template></el-table-column>
        </el-table>
      </section>
    </div>

    <section class="dashboard-panel quick-panel">
      <div class="panel-heading"><div><h3>常用操作</h3><span>根据当前账号权限显示</span></div></div>
      <div class="quick-grid">
        <RouterLink v-for="action in quickActions" :key="action.path" :to="action.path" class="quick-action">
          <el-icon><component :is="action.icon"/></el-icon>
          <div><strong>{{ action.label }}</strong><span>{{ action.description }}</span></div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard { display:grid; gap:18px; min-height:300px; }
.dashboard-heading { display:flex; align-items:center; justify-content:space-between; gap:18px; }
.dashboard-heading h2 { margin:0 0 5px; font-size:21px; }
.dashboard-heading p { margin:0; color:#6b7280; font-size:14px; }
.dashboard-refresh { display:flex; align-items:center; gap:10px; color:#7b8794; font-size:12px; }
.period-strip { min-height:66px; padding:14px 18px; background:#fff; border:1px solid #dfe5ea; border-left:4px solid #0f766e; display:flex; align-items:center; justify-content:space-between; gap:18px; }
.period-main,.period-side { display:flex; align-items:center; gap:12px; }
.period-main strong { font-size:18px; }
.period-label,.period-side span { color:#667085; font-size:13px; }
.period-strip a,.panel-heading a { color:#0f766e; text-decoration:none; font-size:13px; }
.dashboard-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.dashboard-metric { min-width:0; min-height:112px; background:#fff; border:1px solid #dfe5ea; padding:16px; display:flex; align-items:flex-start; gap:14px; color:inherit; text-decoration:none; transition:border-color .16s,box-shadow .16s; }
.dashboard-metric:hover { border-color:#9fb5bf; box-shadow:0 3px 10px rgba(31,41,55,.07); }
.metric-icon { flex:0 0 36px; width:36px; height:36px; display:grid; place-items:center; background:#e9f6f3; color:#0f766e; font-size:18px; }
.metric-icon.is-warning { background:#fff4dd; color:#a15c00; }
.metric-icon.is-primary { background:#eaf2f8; color:#245b78; }
.metric-icon.is-success { background:#e9f6f3; color:#0f766e; }
.metric-copy { min-width:0; display:grid; }
.metric-copy span { color:#667085; font-size:13px; }
.metric-copy strong { margin:3px 0 1px; font-size:25px; line-height:1.2; }
.metric-copy small { color:#8a94a1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dashboard-columns { display:grid; grid-template-columns:minmax(300px,.8fr) minmax(560px,1.6fr); gap:14px; align-items:start; }
.dashboard-panel { background:#fff; border:1px solid #dfe5ea; }
.panel-heading { min-height:58px; padding:12px 16px; border-bottom:1px solid #edf0f2; display:flex; align-items:center; justify-content:space-between; gap:14px; }
.panel-heading h3 { margin:0 0 3px; font-size:15px; }
.panel-heading span { color:#8a94a1; font-size:12px; }
.todo-list { display:grid; }
.todo-row { min-height:61px; padding:10px 16px; border-bottom:1px solid #edf0f2; display:flex; align-items:center; justify-content:space-between; gap:12px; color:inherit; text-decoration:none; }
.todo-row:last-child { border-bottom:0; }
.todo-row:hover { background:#f8fafb; }
.todo-name { min-width:0; display:flex; align-items:center; gap:11px; }
.todo-name>.el-icon { flex:0 0 auto; color:#496777; font-size:17px; }
.todo-name div { min-width:0; display:grid; gap:2px; }
.todo-name strong { font-size:13px; }
.todo-name span { color:#7b8794; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.todo-count { flex:0 0 auto; min-width:30px; height:26px; padding:0 8px; display:grid; place-items:center; background:#fff2d8; color:#915400; font-weight:700; font-size:13px; }
.todo-count.empty { min-width:auto; background:#edf6f2; color:#39735d; font-weight:500; }
.recent-panel { min-width:0; }
.quick-panel { padding-bottom:14px; }
.quick-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; padding:14px; }
.quick-action { min-width:0; min-height:64px; padding:11px 12px; border:1px solid #e2e7eb; display:flex; align-items:center; gap:10px; color:inherit; text-decoration:none; }
.quick-action:hover { border-color:#7fa59e; background:#f5faf9; }
.quick-action>.el-icon { flex:0 0 auto; font-size:19px; color:#0f766e; }
.quick-action div { min-width:0; display:grid; gap:3px; }
.quick-action strong { font-size:13px; }
.quick-action span { color:#7b8794; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
@media (max-width:1200px) {
  .dashboard-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .dashboard-columns { grid-template-columns:1fr; }
  .quick-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
}
@media (max-width:700px) {
  .dashboard-heading { align-items:flex-start; }
  .dashboard-refresh span { display:none; }
  .period-strip,.period-side { align-items:flex-start; }
  .period-strip { flex-direction:column; gap:8px; }
  .period-side { width:100%; justify-content:space-between; }
  .dashboard-metrics { grid-template-columns:1fr 1fr; }
  .dashboard-metric { min-height:104px; padding:13px; gap:10px; }
  .metric-copy small { display:none; }
  .quick-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .recent-panel { overflow:hidden; }
}
@media (max-width:430px) {
  .dashboard-metrics { grid-template-columns:1fr; }
  .dashboard-metric { min-height:86px; }
}
</style>
