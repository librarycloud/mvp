<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { api } from "../utils/api";
import { currentBusinessMonthStart, formatBusinessDate, todayBusinessDate } from "../utils/date";
import { useClientPagination } from "../composables/useClientPagination";

interface AccountOption {
  id: number;
  code: string;
  name: string;
  isLeaf: boolean;
  isEnabled: boolean;
}

type LedgerMode = "general" | "detail" | "balances" | "trial";
const router = useRouter();
const accounts = ref<AccountOption[]>([]);
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
    accounts.value = await api.get<AccountOption[]>("/accounts?tree=false&isEnabled=true");
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
    <section class="page-heading"><div><h2>账簿查询</h2><p>全部数据由已记账凭证实时派生。</p></div></section>
    <el-card shadow="never">
      <div class="filter-row">
        <el-select v-model="mode" style="width: 150px" @change="changeMode">
          <el-option label="总账" value="general"/>
          <el-option label="明细账" value="detail"/>
          <el-option label="科目余额表" value="balances"/>
          <el-option label="试算平衡表" value="trial"/>
        </el-select>
        <el-select
          v-if="needsAccount"
          v-model="accountId"
          filterable
          clearable
          :loading="accountsLoading"
          placeholder="搜索科目编码或名称"
          style="width: 280px"
        >
          <el-option
            v-for="account in postableAccounts"
            :key="account.id"
            :label="`${account.code} ${account.name}`"
            :value="account.id"
          />
        </el-select>
        <el-date-picker v-model="startDate" type="date" value-format="YYYY-MM-DD" placeholder="开始日期"/>
        <el-date-picker v-model="endDate" type="date" value-format="YYYY-MM-DD" placeholder="结束日期"/>
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
        <el-table-column prop="account.code" label="科目编码" min-width="120"/>
        <el-table-column prop="account.name" label="科目名称" min-width="180"/>
        <el-table-column prop="opening.amount" label="期初余额" align="right"/>
        <el-table-column prop="periodDebit" label="本期借方" align="right"/>
        <el-table-column prop="periodCredit" label="本期贷方" align="right"/>
        <el-table-column prop="closing.amount" label="期末余额" align="right"/>
      </el-table>

      <el-table v-else :data="pagedRows" table-layout="auto" stripe>
        <el-table-column prop="account.code" label="科目编码" min-width="120"/>
        <el-table-column prop="account.name" label="科目名称" min-width="180"/>
        <el-table-column prop="openingDebit" label="期初借方" align="right"/>
        <el-table-column prop="openingCredit" label="期初贷方" align="right"/>
        <el-table-column prop="periodDebit" label="本期借方" align="right"/>
        <el-table-column prop="periodCredit" label="本期贷方" align="right"/>
        <el-table-column prop="closingDebit" label="期末借方" align="right"/>
        <el-table-column prop="closingCredit" label="期末贷方" align="right"/>
      </el-table>
      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total"/>
      <el-alert v-if="mode === 'trial'" :type="data.isBalanced ? 'success' : 'error'" :closable="false" class="trial-status" :title="data.isBalanced ? '试算平衡' : '试算不平衡'"/>
    </el-card>
  </div>
</template>

<style scoped>
.ledger-summary { margin-bottom: 18px; }
.trial-status { margin-top: 16px; }
</style>
