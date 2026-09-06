<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../utils/api";

const router = useRouter();
type PeriodType = "MONTH" | "QUARTER" | "YEAR";
const year = ref(new Date().getFullYear());
const periodType = ref<PeriodType>("MONTH");
const period = ref(new Date().getMonth() + 1);
const report = ref<any>();
const history = ref<any[]>([]);
const templates = ref<any[]>([]);
const templateCode = ref("");
const loading = ref(false);
const historyTotal = ref(0);
const historyPage = ref(1);
const historyPageSize = ref(20);

const drillDownDrawer = ref(false);
const selectedReportLine = ref<any>(null);

const periodOptions = computed(() => (periodType.value === "MONTH" ? 12 : periodType.value === "QUARTER" ? 4 : 0));
function changeType() {
  period.value = 1;
}

async function generate(kind: string) {
  loading.value = true;
  try {
    const body = { periodType: periodType.value, fiscalYear: year.value, ...(periodType.value === "YEAR" ? {} : { period: period.value }) };
    report.value = await api.post(`/reports/${kind}/generate`, body);
    await loadHistory(true);
  } finally {
    loading.value = false;
  }
}

async function generateConfigured() {
  if (!templateCode.value) return;
  loading.value = true;
  try {
    const body = { templateCode: templateCode.value, periodType: periodType.value, fiscalYear: year.value, ...(periodType.value === "YEAR" ? {} : { period: period.value }) };
    report.value = await api.post("/reports/generate", body);
    await loadHistory(true);
  } finally {
    loading.value = false;
  }
}

async function loadHistory(resetPage = false) {
  if (resetPage) historyPage.value = 1;
  const data = await api.get<any>(`/reports?page=${historyPage.value}&pageSize=${historyPageSize.value}`);
  history.value = data.items;
  historyTotal.value = data.total;
}

async function open(row: any) {
  report.value = await api.get(`/reports/${row.id}`);
}

function exportFile(format: "xlsx" | "pdf") {
  if (report.value) return api.download(`/reports/${report.value.id}/export.${format}`, `${report.value.template.name}-${String(report.value.periodStart).slice(0, 10)}.${format}`);
}

function handleLineClick(row: any) {
  selectedReportLine.value = row;
  drillDownDrawer.value = true;
}

function goToLedger(accountId: number) {
  if (!report.value) return;
  const startDate = String(report.value.periodStart).slice(0, 10);
  const endDate = String(report.value.periodEnd).slice(0, 10);
  router.push({
    path: "/ledgers",
    query: { accountId: String(accountId), startDate, endDate },
  });
}

const balanceSheetStatus = computed(() => {
  if (!report.value || !report.value.lines) return null;
  const isBalanceSheet =
    report.value.template?.code === "balance-sheet" ||
    report.value.template?.name?.includes("资产负债表") ||
    report.value.lines.some((l: any) => l.reportItem?.itemCode === "TOTAL_ASSETS");
  if (!isBalanceSheet) return null;

  const assetsLine = report.value.lines.find((l: any) => l.reportItem?.itemCode === "TOTAL_ASSETS");
  const liabEquityLine = report.value.lines.find((l: any) => l.reportItem?.itemCode === "TOTAL_LIABILITIES_AND_EQUITY");
  if (!assetsLine || !liabEquityLine) return null;

  const totalAssets = Number(assetsLine.closingAmount ?? 0);
  const totalLiabEquity = Number(liabEquityLine.closingAmount ?? 0);
  const diff = Math.abs(totalAssets - totalLiabEquity);
  const isBalanced = diff <= 0.05;

  return {
    isBalanced,
    totalAssets: assetsLine.closingAmount ?? "0.00",
    totalLiabEquity: liabEquityLine.closingAmount ?? "0.00",
    diff: diff.toFixed(2),
  };
});

onMounted(async () => {
  await Promise.all([
    loadHistory(),
    api.get<any[]>("/report-templates").then((rows) => {
      templates.value = rows.filter((row) => row.isActive);
      templateCode.value = templates.value[0]?.code ?? "";
    }),
  ]);
});
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div>
        <h2>财务报表</h2>
        <p>按数据库模板从已记账凭证生成，支持月报、季报和年报。点击报表行可穿透溯源会计科目及明细账。</p>
      </div>
      <div class="toolbar">
        <el-button v-if="report" @click="exportFile('xlsx')">导出 Excel</el-button>
        <el-button v-if="report" @click="exportFile('pdf')">导出 PDF</el-button>
        <el-select v-model="periodType" style="width: 110px" @change="changeType">
          <el-option label="月报" value="MONTH" />
          <el-option label="季报" value="QUARTER" />
          <el-option label="年报" value="YEAR" />
        </el-select>
        <el-input-number v-model="year" :min="2000" :max="9999" />
        <el-select v-if="periodType !== 'YEAR'" v-model="period" style="width: 110px">
          <el-option v-for="n in periodOptions" :key="n" :label="periodType === 'MONTH' ? `${n}月` : `第${n}季度`" :value="n" />
        </el-select>
      </div>
    </section>

    <section class="report-actions">
      <el-select v-model="templateCode" filterable placeholder="选择启用的报表模板" style="width: 300px">
        <el-option v-for="row in templates" :key="row.id" :label="`${row.name} V${row.version}`" :value="row.code" />
      </el-select>
      <el-button type="primary" :loading="loading" :disabled="!templateCode" @click="generateConfigured">生成所选报表</el-button>
      <el-button :loading="loading" @click="generate('income-statement')">生成利润表</el-button>
      <el-button :loading="loading" @click="generate('balance-sheet')">生成资产负债表</el-button>
      <el-button :loading="loading" @click="generate('cash-flow-statement')">生成现金流量表</el-button>
      <el-button :loading="loading" @click="generate('equity-change-statement')">生成所有者权益变动表</el-button>
    </section>

    <el-card v-if="report" shadow="never">
      <div class="report-title">
        <h3>{{ report.template?.name }}</h3>
        <span>{{ String(report.periodStart).slice(0, 10) }} 至 {{ String(report.periodEnd).slice(0, 10) }}</span>
      </div>
      <div v-if="balanceSheetStatus" style="margin: 12px 0 16px 0;">
        <el-alert :type="balanceSheetStatus.isBalanced ? 'success' : 'error'" :closable="false" show-icon>
          <template #title>
            <span style="font-weight: 600;">
              {{ balanceSheetStatus.isBalanced ? "借贷试算平衡（资产负债表已配平）" : "借贷不平衡（资产负债表存在差额）" }}
            </span>
          </template>
          <div style="margin-top: 6px; display: flex; gap: 24px; font-size: 13px;">
            <span>资产总计: <b>¥{{ balanceSheetStatus.totalAssets }}</b></span>
            <span>负债与所有者权益总计: <b>¥{{ balanceSheetStatus.totalLiabEquity }}</b></span>
            <span v-if="!balanceSheetStatus.isBalanced" style="color: #f56c6c;">差额: <b>¥{{ balanceSheetStatus.diff }}</b></span>
          </div>
        </el-alert>
      </div>
      <el-table
        table-layout="fixed"
        width="100%"
        :data="report.lines"
        stripe
        highlight-current-row
        style="cursor: pointer;"
        @row-click="handleLineClick"
      >
        <el-table-column prop="reportItem.lineNumber" label="行次" width="70" />
        <el-table-column prop="reportItem.name" label="项目" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span style="color: #409eff; font-weight: 500;">{{ row.reportItem?.name }}</span>
            <span v-if="row.reportItem?.accountMappings?.length" style="margin-left: 6px; font-size: 11px; color: #909399;">
              (含 {{ row.reportItem.accountMappings.length }} 个核算科目)
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="openingAmount" label="期初/上期" align="right" width="130" />
        <el-table-column prop="currentAmount" label="本期" align="right" width="130" />
        <el-table-column prop="closingAmount" label="期末/累计" align="right" width="130" />
      </el-table>
    </el-card>

    <el-drawer v-model="drillDownDrawer" title="报表项目穿透溯源" size="520px">
      <div v-if="selectedReportLine" style="display: flex; flex-direction: column; gap: 16px;">
        <div style="background: #f4f4f5; padding: 12px 16px; border-radius: 6px;">
          <h4 style="margin: 0 0 8px 0; color: #303133;">
            行次 {{ selectedReportLine.reportItem?.lineNumber }}：{{ selectedReportLine.reportItem?.name }}
          </h4>
          <div style="display: flex; gap: 16px; font-size: 13px; color: #606266;">
            <span>期初: <b>¥{{ selectedReportLine.openingAmount }}</b></span>
            <span>本期: <b>¥{{ selectedReportLine.currentAmount }}</b></span>
            <span>期末: <b>¥{{ selectedReportLine.closingAmount }}</b></span>
          </div>
        </div>

        <div>
          <h5 style="margin: 0 0 10px 0;">关联核算科目取数映射</h5>
          <div v-if="selectedReportLine.reportItem?.accountMappings?.length">
            <el-table :data="selectedReportLine.reportItem.accountMappings" size="small" border>
              <el-table-column prop="account.code" label="科目代码" width="110" />
              <el-table-column prop="account.name" label="科目名称" min-width="130" show-overflow-tooltip />
              <el-table-column prop="operator" label="运算" width="70" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.operator === 'ADD' ? 'success' : 'danger'" size="small">
                    {{ row.operator === 'ADD' ? '+加' : '-减' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="110" align="center">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="goToLedger(row.accountId)">
                    查看明细账
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-else style="color: #909399; font-size: 13px; padding: 12px 0;">
            该行次为公式计算项或汇总行，其数值由其他报表行次计算生成。
          </div>
        </div>
      </div>
    </el-drawer>

    <el-card shadow="never">
      <template #header><b>历史报表</b></template>
      <el-table table-layout="auto" :data="history" size="small" @row-click="open">
        <el-table-column prop="template.name" label="报表" />
        <el-table-column prop="periodType" label="周期" />
        <el-table-column prop="periodStart" label="开始日期">
          <template #default="{ row }">{{ String(row.periodStart).slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column prop="periodEnd" label="结束日期">
          <template #default="{ row }">{{ String(row.periodEnd).slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column prop="generatedBy.displayName" label="生成人" />
        <el-table-column prop="generatedAt" label="生成时间" />
      </el-table>
      <PaginationBar v-model:page="historyPage" v-model:page-size="historyPageSize" :total="historyTotal" @change="loadHistory()" />
    </el-card>
  </div>
</template>
