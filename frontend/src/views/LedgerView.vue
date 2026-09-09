<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { api } from "../utils/api";
import { currentBusinessMonthStart, formatBusinessDate, todayBusinessDate } from "../utils/date";
import { exportToCsv } from "../utils/export";
import { useClientPagination } from "../composables/useClientPagination";

interface AccountOption {
  id: number;
  code: string;
  name: string;
  isLeaf: boolean;
  isEnabled: boolean;
}

type LedgerMode = "general" | "detail" | "balances" | "trial" | "auxiliary";
const router = useRouter();
const accounts = ref<AccountOption[]>([]);
const dimensions = ref<any[]>([]);
const dimensionId = ref<number | "">("");
const periods = ref<any[]>([]);
const selectedPeriodId = ref<number | "">("");
const accountId = ref<number | "">("");
const startDate = ref(currentBusinessMonthStart());
const endDate = ref(todayBusinessDate());
const mode = ref<LedgerMode>("general");
const data = ref<any>();
const tableRows = computed<any[]>(() => mode.value === "general" || mode.value === "detail" ? data.value?.lines ?? [] : data.value?.rows ?? []);
const { page, pageSize, total, pagedRows, resetPage } = useClientPagination(tableRows);
const loading = ref(false);
const accountsLoading = ref(false);
const needsAccount = computed(() => mode.value === "general" || mode.value === "detail");
const postableAccounts = computed(() => accounts.value.filter((account) => account.isLeaf && account.isEnabled));

async function loadAccounts() {
  accountsLoading.value = true;
  try {
    const [accountList, periodList, dimList] = await Promise.all([
      api.get<AccountOption[]>("/accounts?tree=false&isEnabled=true"),
      api.get<any[]>("/accounting-periods"),
      api.get<any[]>("/dimensions").catch(() => []),
    ]);
    accounts.value = accountList;
    periods.value = periodList;
    dimensions.value = dimList;
  } finally {
    accountsLoading.value = false;
  }
}

async function query() {
  if (needsAccount.value && !accountId.value) {
    ElMessage.warning("请选择会计科目");
    return;
  }
  if (startDate.value > endDate.value) {
    ElMessage.warning("开始日期不能晚于结束日期");
    return;
  }
  resetPage();
  loading.value = true;
  try {
    const dates = `startDate=${startDate.value}&endDate=${endDate.value}`;
    const path = mode.value === "general"
      ? `/general-ledger?accountId=${accountId.value}&${dates}`
      : mode.value === "detail"
        ? `/detail-ledger?accountId=${accountId.value}&${dates}`
        : mode.value === "balances"
          ? `/account-balances?${dates}&includeZero=false`
          : mode.value === "auxiliary"
            ? `/account-balances/auxiliary?${dates}&includeZero=false${accountId.value ? `&accountId=${accountId.value}` : ''}${dimensionId.value ? `&dimensionId=${dimensionId.value}` : ''}`
            : `/trial-balance?${dates}`;
    data.value = await api.get(path);
  } finally {
    loading.value = false;
  }
}

function changeMode() {
  data.value = undefined;
}

function openVoucher(voucherId: number) {
  router.push({ path: "/vouchers", query: { voucherId: String(voucherId) } });
}

function drillToDetail(accId: number) {
  mode.value = "detail";
  accountId.value = accId;
  void query();
}

function onPeriodSelect(id: number | "") {
  if (!id) return;
  const period = periods.value.find((p) => p.id === id);
  if (period) {
    startDate.value = period.startDate.slice(0, 10);
    endDate.value = period.endDate.slice(0, 10);
    void query();
  }
}

function setDateRange(rangeType: "currentMonth" | "lastMonth" | "currentYear") {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (rangeType === "currentMonth") {
    startDate.value = currentBusinessMonthStart();
    endDate.value = todayBusinessDate();
  } else if (rangeType === "lastMonth") {
    const lastMonthDate = new Date(year, month - 1, 1);
    const lastMonthEnd = new Date(year, month, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    startDate.value = `${lastMonthDate.getFullYear()}-${pad(lastMonthDate.getMonth() + 1)}-01`;
    endDate.value = `${lastMonthEnd.getFullYear()}-${pad(lastMonthEnd.getMonth() + 1)}-${pad(lastMonthEnd.getDate())}`;
  } else if (rangeType === "currentYear") {
    startDate.value = `${year}-01-01`;
    endDate.value = todayBusinessDate();
  }
  selectedPeriodId.value = "";
  void query();
}

function exportLedger() {
  if (!tableRows.value.length) {
    ElMessage.warning("当前没有可导出的账簿数据");
    return;
  }
  let filename = "";
  let headers: string[] = [];
  let exportRows: (string | number)[][] = [];

  if (mode.value === "general" || mode.value === "detail") {
    const accName = data.value?.account ? `${data.value.account.code}_${data.value.account.name}` : "";
    const modeName = mode.value === "general" ? "总分类账" : "明细分类账";
    filename = `${modeName}_${accName}_${startDate.value}至${endDate.value}`;
    headers = ["日期", "凭证号", "摘要", "借方", "贷方", "余额"];
    exportRows = tableRows.value.map((r) => [
      formatBusinessDate(r.voucherDate),
      r.voucherNo ?? "",
      (mode.value === "detail" ? r.entrySummary : r.summary) ?? "",
      r.debitAmount ?? "",
      r.creditAmount ?? "",
      r.balance ?? "",
    ]);
  } else if (mode.value === "balances") {
    filename = `科目余额表_${startDate.value}至${endDate.value}`;
    headers = ["科目编码", "科目名称", "期初余额", "本期借方", "本期贷方", "期末余额"];
    exportRows = tableRows.value.map((r) => [
      r.account?.code ?? "",
      r.account?.name ?? "",
      r.opening?.amount ?? "0.00",
      r.periodDebit ?? "0.00",
      r.periodCredit ?? "0.00",
      r.closing?.amount ?? "0.00",
    ]);
  } else if (mode.value === "auxiliary") {
    filename = `科目辅助核算余额表_${startDate.value}至${endDate.value}`;
    headers = ["科目编码", "科目名称", "核算类别", "项目编码", "项目名称", "期初方向", "期初余额", "本期借方", "本期贷方", "期末方向", "期末余额"];
    exportRows = tableRows.value.map((r) => [
      r.accountCode ?? "",
      r.accountName ?? "",
      r.dimensionName ?? "",
      r.memberCode ?? "",
      r.memberName ?? "",
      r.openingDirection ?? "",
      r.openingBalance ?? "0.00",
      r.periodDebit ?? "0.00",
      r.periodCredit ?? "0.00",
      r.closingDirection ?? "",
      r.closingBalance ?? "0.00",
    ]);
  } else {
    filename = `试算平衡表_${startDate.value}至${endDate.value}`;
    headers = ["科目编码", "科目名称", "期初借方", "期初贷方", "本期借方", "本期贷方", "期末借方", "期末贷方"];
    exportRows = tableRows.value.map((r) => [
      r.account?.code ?? "",
      r.account?.name ?? "",
      r.openingDebit ?? "0.00",
      r.openingCredit ?? "0.00",
      r.periodDebit ?? "0.00",
      r.periodCredit ?? "0.00",
      r.closingDebit ?? "0.00",
      r.closingCredit ?? "0.00",
    ]);
  }

  exportToCsv(filename, headers, exportRows);
  ElMessage.success(`已导出 ${exportRows.length} 行账簿数据`);
}

function balanceText(balance: { direction: "DEBIT" | "CREDIT" | null; amount: string } | undefined) {
  if (!balance) return "0";
  if (balance.direction === "DEBIT") return `借 ${balance.amount}`;
  if (balance.direction === "CREDIT") return `贷 ${balance.amount}`;
  return balance.amount;
}

onMounted(loadAccounts);
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div>
        <h2>账簿查询</h2>
        <p>全部数据由已记账凭证实时派生，支持科目穿透联查与一键导出。</p>
      </div>
      <div class="toolbar">
        <el-button @click="exportLedger">导出 Excel</el-button>
      </div>
    </section>

    <el-card shadow="never">
      <div class="filter-row">
        <el-select v-model="mode" style="width: 170px" @change="changeMode">
          <el-option label="总账" value="general"/>
          <el-option label="明细账" value="detail"/>
          <el-option label="科目余额表" value="balances"/>
          <el-option label="科目辅助核算余额表" value="auxiliary"/>
          <el-option label="试算平衡表" value="trial"/>
        </el-select>

        <el-select
          v-if="needsAccount || mode === 'auxiliary'"
          v-model="accountId"
          filterable
          clearable
          :loading="accountsLoading"
          :placeholder="mode === 'auxiliary' ? '科目 (全部)' : '搜索科目编码或名称'"
          style="width: 240px"
        >
          <el-option
            v-for="account in postableAccounts"
            :key="account.id"
            :label="`${account.code} ${account.name}`"
            :value="account.id"
          />
        </el-select>

        <el-select
          v-if="mode === 'auxiliary'"
          v-model="dimensionId"
          clearable
          placeholder="辅助核算类型 (全部)"
          style="width: 170px"
        >
          <el-option v-for="d in dimensions" :key="d.id" :label="`${d.code} ${d.name}`" :value="d.id" />
        </el-select>

        <el-select
          v-model="selectedPeriodId"
          clearable
          placeholder="会计期间"
          style="width: 130px"
          @change="onPeriodSelect"
        >
          <el-option v-for="p in periods" :key="p.id" :label="p.periodCode" :value="p.id" />
        </el-select>

        <el-date-picker v-model="startDate" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width: 140px"/>
        <el-date-picker v-model="endDate" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" style="width: 140px"/>

        <el-button-group>
          <el-button @click="setDateRange('currentMonth')">本月</el-button>
          <el-button @click="setDateRange('lastMonth')">上月</el-button>
          <el-button @click="setDateRange('currentYear')">本年</el-button>
        </el-button-group>

        <el-button type="primary" :loading="loading" @click="query">查询</el-button>
      </div>
    </el-card>

    <el-card v-if="data" shadow="never">
      <el-descriptions v-if="data.account" :column="5" border class="ledger-summary">
        <el-descriptions-item label="会计科目">{{ data.account.code }} {{ data.account.name }}</el-descriptions-item>
        <el-descriptions-item label="期初余额">{{ balanceText(data.opening) }}</el-descriptions-item>
        <el-descriptions-item label="本期借方">{{ data.periodDebit ?? "0" }}</el-descriptions-item>
        <el-descriptions-item label="本期贷方">{{ data.periodCredit ?? "0" }}</el-descriptions-item>
        <el-descriptions-item label="期末余额">{{ balanceText(data.closing) }}</el-descriptions-item>
      </el-descriptions>

      <el-table v-if="mode === 'general' || mode === 'detail'" table-layout="auto" :data="pagedRows" stripe>
        <el-table-column label="日期" width="110"><template #default="{ row }">{{ formatBusinessDate(row.voucherDate) }}</template></el-table-column>
        <el-table-column label="凭证号" min-width="135"><template #default="{ row }"><el-button link type="primary" @click="openVoucher(row.voucherId)">{{ row.voucherNo }}</el-button></template></el-table-column>
        <el-table-column :prop="mode === 'detail' ? 'entrySummary' : 'summary'" label="摘要" min-width="220" show-overflow-tooltip/>
        <el-table-column prop="debitAmount" label="借方" align="right" width="130"/>
        <el-table-column prop="creditAmount" label="贷方" align="right" width="130"/>
        <el-table-column prop="balance" label="余额" align="right" width="130"/>
      </el-table>

      <el-table v-else-if="mode === 'balances'" :data="pagedRows" table-layout="auto" stripe>
        <el-table-column label="科目编码" min-width="120">
          <template #default="{ row }">
            <el-button link type="primary" @click="drillToDetail(row.account.id)">{{ row.account.code }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="科目名称" min-width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="drillToDetail(row.account.id)">{{ row.account.name }}</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="opening.amount" label="期初余额" align="right"/>
        <el-table-column prop="periodDebit" label="本期借方" align="right"/>
        <el-table-column prop="periodCredit" label="本期贷方" align="right"/>
        <el-table-column prop="closing.amount" label="期末余额" align="right"/>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="drillToDetail(row.account.id)">穿透明细</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-table v-else-if="mode === 'auxiliary'" :data="pagedRows" table-layout="auto" stripe border>
        <el-table-column prop="accountCode" label="科目编码" width="100" />
        <el-table-column prop="accountName" label="科目名称" min-width="130" show-overflow-tooltip />
        <el-table-column prop="dimensionName" label="核算类别" width="110" />
        <el-table-column label="核算项目" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.memberCode }} {{ row.memberName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="期初余额" align="right" width="120">
          <template #default="{ row }">
            <span v-if="row.openingDirection !== 'FLAT'">{{ row.openingDirection === 'DEBIT' ? '借' : '贷' }} {{ row.openingBalance }}</span>
            <span v-else>平</span>
          </template>
        </el-table-column>
        <el-table-column prop="periodDebit" label="本期借方" align="right" width="110" />
        <el-table-column prop="periodCredit" label="本期贷方" align="right" width="110" />
        <el-table-column label="期末余额" align="right" width="120">
          <template #default="{ row }">
            <span v-if="row.closingDirection !== 'FLAT'">{{ row.closingDirection === 'DEBIT' ? '借' : '贷' }} {{ row.closingBalance }}</span>
            <span v-else>平</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="drillToDetail(row.accountId)">穿透明细</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-table v-else :data="pagedRows" table-layout="auto" stripe>
        <el-table-column label="科目编码" min-width="120">
          <template #default="{ row }">
            <el-button link type="primary" @click="drillToDetail(row.account.id)">{{ row.account.code }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="科目名称" min-width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="drillToDetail(row.account.id)">{{ row.account.name }}</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="openingDebit" label="期初借方" align="right"/>
        <el-table-column prop="openingCredit" label="期初贷方" align="right"/>
        <el-table-column prop="periodDebit" label="本期借方" align="right"/>
        <el-table-column prop="periodCredit" label="本期贷方" align="right"/>
        <el-table-column prop="closingDebit" label="期末借方" align="right"/>
        <el-table-column prop="closingCredit" label="期末贷方" align="right"/>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="drillToDetail(row.account.id)">穿透明细</el-button>
          </template>
        </el-table-column>
      </el-table>
      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total"/>
      <el-alert v-if="mode === 'trial'" :type="data.isBalanced ? 'success' : 'error'" :closable="false" class="trial-status" :title="data.isBalanced ? '试算平衡' : '试算不平衡'"/>
    </el-card>
  </div>
</template>

<style scoped>
.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.ledger-summary { margin-bottom: 18px; }
.trial-status { margin-top: 16px; }
</style>
