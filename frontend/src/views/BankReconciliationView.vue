<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowUp, Edit } from "@element-plus/icons-vue";
import { api } from "../utils/api";
import { formatBusinessDate } from "../utils/date";
import { useAuthStore } from "../stores/auth";
import { useClientPagination } from "../composables/useClientPagination";

const router = useRouter();
const auth = useAuthStore();
const isAdmin = computed(() => auth.canOperateCash);
const periods = ref<any[]>([]); const accounts = ref<any[]>([]); const rows = ref<any[]>([]); const active = ref<any>();
const { page, pageSize, total, pagedRows } = useClientPagination(rows);
const loading = ref(false); const createVisible = ref(false); const editVisible = ref(false); const matchVisible = ref(false); const editSaving = ref(false);
const directionSavingId = ref<number>();
const onlyUnmatched = ref(false);

const form = reactive({ periodId: "" as number | "", bankAccountId: "" as number | "", statementOpeningBalance: "0", statementClosingBalance: "0", remark: "" });
const editForm = reactive({ statementOpeningBalance: "0", statementClosingBalance: "0", remark: "" });
const matchForm = reactive({ bankTransactionId: "" as number | "", voucherEntryId: "" as number | "", matchedAmount: "" });
const previousCreateInfo = ref<{ hasPrevious: boolean; periodCode?: string; statementClosingBalance?: string } | null>(null);
const previousEditInfo = ref<{ hasPrevious: boolean; periodCode?: string; statementClosingBalance?: string } | null>(null);
const loadingPreviousCreate = ref(false);
const loadingPreviousEdit = ref(false);

const draftTransactions = computed(() => active.value?.transactions?.filter((row:any) => Number(row.remainingAmount) > 0) ?? []);
const draftEntries = computed(() => active.value?.entries?.filter((row:any) => Number(row.remainingAmount) > 0) ?? []);
const filteredTransactions = computed(() => onlyUnmatched.value ? draftTransactions.value : (active.value?.transactions ?? []));
const filteredEntries = computed(() => onlyUnmatched.value ? draftEntries.value : (active.value?.entries ?? []));

const unknownDirectionCount = computed(() => active.value?.transactions?.filter((row:any) => row.direction === "UNKNOWN").length ?? 0);
const directionLabels: Record<string, string> = { INFLOW: "流入", OUTFLOW: "流出", UNKNOWN: "待确认" };
const directionText = (row:any) => directionLabels[row?.direction] ?? "待确认";
const selectedTransaction = computed(() => draftTransactions.value.find((row:any) => row.id === matchForm.bankTransactionId));
const selectedEntry = computed(() => draftEntries.value.find((row:any) => row.id === matchForm.voucherEntryId));
const selectedDirection = computed(() => selectedTransaction.value?.direction);
const compatibleEntryCount = computed(() => draftEntries.value.filter((row:any) => row.direction === selectedDirection.value).length);

const existingReconciliation = computed(() => {
  if (!form.periodId || !form.bankAccountId) return null;
  return rows.value.find(row => row.periodId === form.periodId && row.bankAccountId === form.bankAccountId) ?? null;
});

const isEntrySameAmount = (entry: any) => {
  if (!selectedTransaction.value) return false;
  return Number(entry.remainingAmount) === Number(selectedTransaction.value.remainingAmount);
};

const sortedDraftEntries = computed(() => {
  const list = [...draftEntries.value];
  const targetDir = selectedDirection.value;
  const targetAmount = selectedTransaction.value ? Number(selectedTransaction.value.remainingAmount) : null;
  list.sort((a, b) => {
    const aDirMatch = a.direction === targetDir ? 1 : 0;
    const bDirMatch = b.direction === targetDir ? 1 : 0;
    if (aDirMatch !== bDirMatch) return bDirMatch - aDirMatch;
    if (targetAmount !== null) {
      const aSame = Number(a.remainingAmount) === targetAmount ? 1 : 0;
      const bSame = Number(b.remainingAmount) === targetAmount ? 1 : 0;
      if (aSame !== bSame) return bSame - aSame;
    }
    return 0;
  });
  return list;
});

const entryHint = computed(() => {
  if (!selectedTransaction.value) return "请先选择银行流水";
  if (!draftEntries.value.length && active.value?.unpostedBankEntryCount) return `当前有 ${active.value.unpostedBankEntryCount} 条银行科目分录尚未记账，请先在凭证页完成审核和记账`;
  if (!draftEntries.value.length) return "当前期间、所选银行科目下没有可匹配的已记账分录";
  if (!compatibleEntryCount.value) return "已有已记账分录，但借贷方向与所选流水不一致";
  return "只可选择与流水方向一致的已记账分录";
});

function formatMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function goToVouchers() {
  router.push("/vouchers");
}

async function load() { loading.value = true; try { rows.value = await api.get<any[]>("/bank-reconciliations"); } finally { loading.value = false; } }
async function support() { [periods.value, accounts.value] = await Promise.all([api.get<any[]>("/accounting-periods"), api.get<any[]>("/accounts?tree=false&isEnabled=true")]); accounts.value = accounts.value.filter(row => row.isLeaf && row.code.startsWith("1002")); }

async function syncCreateOpeningBalance(manual = false) {
  if (!form.periodId || !form.bankAccountId) {
    previousCreateInfo.value = null;
    return;
  }
  loadingPreviousCreate.value = true;
  try {
    const res = await api.get<{ hasPrevious: boolean; periodCode?: string; statementClosingBalance?: string }>(
      `/bank-reconciliations/previous-closing?periodId=${form.periodId}&bankAccountId=${form.bankAccountId}`
    );
    previousCreateInfo.value = res;
    if (res.hasPrevious && res.statementClosingBalance != null) {
      form.statementOpeningBalance = res.statementClosingBalance;
      if (manual) ElMessage.success(`已带入上期（${res.periodCode}）银行期末余额 ¥${res.statementClosingBalance}`);
    } else if (manual) {
      ElMessage.info("未查询到上一期间的银行对账单记录");
    }
  } catch (error: any) {
    if (manual) ElMessage.error(error.message || "获取上期余额失败");
  } finally {
    loadingPreviousCreate.value = false;
  }
}

async function openCreate() {
  previousCreateInfo.value = null;
  Object.assign(form, {
    periodId: periods.value.find(row => row.status === 0)?.id ?? periods.value[0]?.id ?? "",
    bankAccountId: accounts.value[0]?.id ?? "",
    statementOpeningBalance: "0",
    statementClosingBalance: "0",
    remark: "",
  });
  createVisible.value = true;
  await syncCreateOpeningBalance(false);
}

async function create() { await api.post("/bank-reconciliations", form); createVisible.value = false; await load(); ElMessage.success("银行对账单已建立"); }
async function open(row:any) { active.value = await api.get(`/bank-reconciliations/${row.id}`); }

async function loadPreviousForEdit() {
  const periodId = active.value?.periodId ?? active.value?.period?.id;
  const bankAccountId = active.value?.bankAccountId ?? active.value?.bankAccount?.id;
  if (!periodId || !bankAccountId) return;
  loadingPreviousEdit.value = true;
  try {
    const res = await api.get<{ hasPrevious: boolean; periodCode?: string; statementClosingBalance?: string }>(
      `/bank-reconciliations/previous-closing?periodId=${periodId}&bankAccountId=${bankAccountId}`
    );
    previousEditInfo.value = res;
  } catch {
    previousEditInfo.value = null;
  } finally {
    loadingPreviousEdit.value = false;
  }
}

async function applyPreviousToEdit() {
  if (!previousEditInfo.value) {
    await loadPreviousForEdit();
  }
  if (!previousEditInfo.value?.hasPrevious || previousEditInfo.value.statementClosingBalance == null) {
    ElMessage.info("未查询到上一期间的银行对账单记录");
    return;
  }
  editForm.statementOpeningBalance = previousEditInfo.value.statementClosingBalance;
  ElMessage.success(`已带入上期（${previousEditInfo.value.periodCode}）银行期末余额 ¥${previousEditInfo.value.statementClosingBalance}`);
}

function openEdit() {
  previousEditInfo.value = null;
  Object.assign(editForm, {
    statementOpeningBalance: String(active.value.statementOpeningBalance),
    statementClosingBalance: String(active.value.statementClosingBalance),
    remark: active.value.remark ?? "",
  });
  editVisible.value = true;
  loadPreviousForEdit();
}

async function saveEdit() { editSaving.value = true; try { await api.put(`/bank-reconciliations/${active.value.id}`, editForm); editVisible.value = false; await Promise.all([open(active.value), load()]); ElMessage.success("银行对账单已更新"); } finally { editSaving.value = false; } }
function openMatch() { Object.assign(matchForm, { bankTransactionId: "", voucherEntryId: "", matchedAmount: "" }); matchVisible.value = true; }

function openMatchFromTransaction(row: any) {
  matchForm.bankTransactionId = row.id;
  matchForm.matchedAmount = row.remainingAmount;
  const candidateEntries = draftEntries.value.filter((item: any) => item.direction === row.direction);
  const exactEntry = candidateEntries.find((item: any) => Number(item.remainingAmount) === Number(row.remainingAmount));
  if (exactEntry) {
    matchForm.voucherEntryId = exactEntry.id;
    matchForm.matchedAmount = Math.min(Number(row.remainingAmount), Number(exactEntry.remainingAmount)).toFixed(2);
  } else {
    matchForm.voucherEntryId = "";
  }
  matchVisible.value = true;
}

function openMatchFromEntry(row: any) {
  matchForm.voucherEntryId = row.id;
  const candidateTx = draftTransactions.value.filter((item: any) => item.direction === row.direction);
  const exactTx = candidateTx.find((item: any) => Number(item.remainingAmount) === Number(row.remainingAmount));
  if (exactTx) {
    matchForm.bankTransactionId = exactTx.id;
    matchForm.matchedAmount = Math.min(Number(exactTx.remainingAmount), Number(row.remainingAmount)).toFixed(2);
  } else {
    matchForm.bankTransactionId = "";
    matchForm.matchedAmount = row.remainingAmount;
  }
  matchVisible.value = true;
}

function selectTransaction(id:number) {
  matchForm.bankTransactionId = id;
  const row = draftTransactions.value.find((item:any) => item.id === id);
  if (row) {
    if (!matchForm.voucherEntryId) {
      const candidateEntries = draftEntries.value.filter((item: any) => item.direction === row.direction);
      const exactEntry = candidateEntries.find((item: any) => Number(item.remainingAmount) === Number(row.remainingAmount));
      if (exactEntry) {
        matchForm.voucherEntryId = exactEntry.id;
        matchForm.matchedAmount = Math.min(Number(row.remainingAmount), Number(exactEntry.remainingAmount)).toFixed(2);
        return;
      }
      matchForm.matchedAmount = row.remainingAmount;
    } else {
      const entryAmount = Number(selectedEntry.value?.remainingAmount ?? 0);
      matchForm.matchedAmount = Math.min(Number(row.remainingAmount), entryAmount).toFixed(2);
    }
  }
}

function selectEntry(id:number) {
  matchForm.voucherEntryId = id;
  const entry = draftEntries.value.find((item:any) => item.id === id);
  if (entry) {
    if (!matchForm.bankTransactionId) {
      const candidateTx = draftTransactions.value.filter((item: any) => item.direction === entry.direction);
      const exactTx = candidateTx.find((item: any) => Number(item.remainingAmount) === Number(entry.remainingAmount));
      if (exactTx) {
        matchForm.bankTransactionId = exactTx.id;
        matchForm.matchedAmount = Math.min(Number(exactTx.remainingAmount), Number(entry.remainingAmount)).toFixed(2);
        return;
      }
      matchForm.matchedAmount = entry.remainingAmount;
    } else {
      const transactionAmount = Number(selectedTransaction.value?.remainingAmount ?? 0);
      matchForm.matchedAmount = Math.min(transactionAmount, Number(entry.remainingAmount)).toFixed(2);
    }
  }
}

async function saveMatch() { await api.post(`/bank-reconciliations/${active.value.id}/matches`, matchForm); matchVisible.value = false; await Promise.all([open(active.value), load()]); }
async function unmatch(id:number) { await api.delete(`/bank-reconciliations/matches/${id}`); await Promise.all([open(active.value), load()]); }
async function autoMatch() { const result = await api.post<{matchedCount:number}>(`/bank-reconciliations/${active.value.id}/auto-match`); await Promise.all([open(active.value), load()]); ElMessage.success(`自动匹配 ${result.matchedCount} 项`); }
async function complete() { await api.post(`/bank-reconciliations/${active.value.id}/complete`); await load(); await open(active.value); }
async function reopen() { await api.post(`/bank-reconciliations/${active.value.id}/reopen`); await load(); await open(active.value); }
async function confirmDirection(row:any, direction:"INFLOW"|"OUTFLOW") { directionSavingId.value = row.id; try { await api.put(`/bank-reconciliations/${active.value.id}/transactions/${row.id}/direction`, { direction }); await open(active.value); ElMessage.success("流水方向已确认"); } finally { directionSavingId.value = undefined; } }
onMounted(async () => { await Promise.all([support(), load()]); });
</script>

<template><div class="page-grid">
  <section class="page-heading"><div><h2>银行对账</h2><p>按会计期间核对银行流水与银行存款凭证分录。</p></div><el-button type="primary" @click="openCreate">建立对账单</el-button></section>
  <el-card shadow="never">
    <el-table v-loading="loading" :data="pagedRows" stripe @row-click="open">
      <el-table-column prop="reconciliationNo" label="对账单号" min-width="140" />
      <el-table-column prop="period.periodCode" label="期间" width="100" />
      <el-table-column label="银行科目" min-width="160">
        <template #default="{row}">{{row.bankAccount.code}} {{row.bankAccount.name}}</template>
      </el-table-column>
      <el-table-column label="银行期初余额" align="right" min-width="120">
        <template #default="{row}">¥{{ formatMoney(row.statementOpeningBalance) }}</template>
      </el-table-column>
      <el-table-column label="银行期末余额" align="right" min-width="120">
        <template #default="{row}">¥{{ formatMoney(row.statementClosingBalance) }}</template>
      </el-table-column>
      <el-table-column label="账面期末余额" align="right" min-width="120">
        <template #default="{row}">¥{{ formatMoney(row.bookClosingBalance) }}</template>
      </el-table-column>
      <el-table-column label="差额" align="right" min-width="130">
        <template #default="{row}">
          <el-tag v-if="Number(row.difference) === 0" type="success" size="small">已平衡 ¥0.00</el-tag>
          <span v-else style="color:var(--el-color-danger);font-weight:600">¥{{ formatMoney(row.difference) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{row}"><el-tag :type="row.status===1?'success':'warning'">{{row.status===1?'已完成':'对账中'}}</el-tag></template>
      </el-table-column>
    </el-table>
    <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total"/>
  </el-card>

  <template v-if="active">
    <section class="page-heading">
      <div>
        <h3>{{active.reconciliationNo}}</h3>
        <p>{{active.bankAccount.code}} {{active.bankAccount.name}} · {{active.period.periodCode}}</p>
      </div>
      <div class="toolbar">
        <el-button v-if="active.status===0" :icon="Edit" @click="openEdit">编辑</el-button>
        <el-button v-if="active.status===0" @click="autoMatch">自动匹配</el-button>
        <el-button v-if="active.status===0" type="primary" @click="openMatch">手工匹配</el-button>
        <el-button v-if="active.status===0&&isAdmin" type="success" @click="complete">完成对账</el-button>
        <el-button v-if="active.status===1&&isAdmin" @click="reopen">重新打开</el-button>
        <el-button text :icon="ArrowUp" @click="active = undefined">收起详情</el-button>
      </div>
    </section>

    <el-alert v-if="!active.companyBankAccount" type="warning" :closable="false" show-icon title="请先在发票页面的企业资料中填写银行账号，系统才能识别流水的流入和流出方向。" style="margin-bottom:12px"/>
    <el-alert v-else-if="unknownDirectionCount" type="warning" :closable="false" show-icon :title="`有 ${unknownDirectionCount} 条金额为零的流水无法自动识别，请在下方方向列人工确认。`" style="margin-bottom:12px"/>
    <el-alert v-if="active.unpostedBankEntryCount" type="info" :closable="false" show-icon style="margin-bottom:12px">
      <template #title>
        <span>当前期间有 <b>{{ active.unpostedBankEntryCount }}</b> 条银行科目分录尚未记账，可能影响账面余额。</span>
        <el-button link type="primary" size="small" style="margin-left:8px" @click="goToVouchers">前往审核记账 &rarr;</el-button>
      </template>
    </el-alert>

    <section class="summary-grid">
      <el-card shadow="never">
        <div class="metric-label">未匹配流水</div>
        <strong>{{draftTransactions.length}}</strong>
      </el-card>
      <el-card shadow="never">
        <div class="metric-label">未匹配分录</div>
        <strong>{{draftEntries.length}}</strong>
      </el-card>
      <el-card shadow="never">
        <div class="metric-label">未匹配金额差额</div>
        <strong :style="{ color: Number(active.matchingDifference ?? 0) === 0 ? 'var(--el-color-success)' : 'var(--el-color-warning)' }">
          ¥{{ formatMoney(active.matchingDifference ?? 0) }}
        </strong>
      </el-card>
      <el-card shadow="never">
        <div class="metric-label">余额差额</div>
        <strong :style="{ color: Number(active.difference ?? 0) === 0 ? 'var(--el-color-success)' : 'var(--el-color-danger)' }">
          {{ Number(active.difference ?? 0) === 0 ? '¥0.00 (已平衡)' : '¥' + formatMoney(active.difference) }}
        </strong>
      </el-card>
    </section>

    <el-card shadow="never">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div></div>
        <el-checkbox v-model="onlyUnmatched">仅显示未匹配记录</el-checkbox>
      </div>
      <el-tabs>
        <el-tab-pane label="银行流水">
          <el-table :data="filteredTransactions" size="small">
            <el-table-column label="日期" width="110">
              <template #default="{row}">{{formatBusinessDate(row.transactionDate)}}</template>
            </el-table-column>
            <el-table-column prop="transactionNo" label="流水号" min-width="120" />
            <el-table-column prop="summary" label="摘要" min-width="140" />
            <el-table-column label="方向" width="110">
              <template #default="{row}">
                <el-tag v-if="row.direction!=='UNKNOWN'" :type="row.direction==='INFLOW'?'success':'danger'">{{directionText(row)}}</el-tag>
                <el-select v-else :model-value="''" :disabled="active.status!==0" :loading="directionSavingId===row.id" placeholder="待确认" size="small" style="width:85px" @change="(value:any)=>confirmDirection(row,value)">
                  <el-option label="流入" value="INFLOW"/>
                  <el-option label="流出" value="OUTFLOW"/>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="金额" align="right" min-width="110">
              <template #default="{row}">¥{{ formatMoney(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="已匹配" align="right" min-width="110">
              <template #default="{row}">¥{{ formatMoney(row.matchedAmount) }}</template>
            </el-table-column>
            <el-table-column label="未匹配" align="right" min-width="110">
              <template #default="{row}">
                <span :style="{ color: Number(row.remainingAmount) > 0 ? 'var(--el-color-warning)' : 'var(--el-text-color-secondary)', fontWeight: Number(row.remainingAmount) > 0 ? 600 : 400 }">
                  ¥{{ formatMoney(row.remainingAmount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column v-if="active.status === 0" label="操作" width="75" fixed="right" align="center">
              <template #default="{row}">
                <el-button v-if="Number(row.remainingAmount) > 0" text type="primary" size="small" @click="openMatchFromTransaction(row)">匹配</el-button>
                <span v-else style="color:var(--el-color-success);font-size:12px">已结清</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="账面分录">
          <el-table :data="filteredEntries" size="small">
            <el-table-column label="日期" width="110">
              <template #default="{row}">{{formatBusinessDate(row.voucher.postingDate)}}</template>
            </el-table-column>
            <el-table-column prop="voucher.voucherNo" label="凭证号" min-width="110" />
            <el-table-column prop="summary" label="摘要" min-width="140" />
            <el-table-column label="方向" width="90">
              <template #default="{row}">{{directionText(row)}}</template>
            </el-table-column>
            <el-table-column label="金额" align="right" min-width="110">
              <template #default="{row}">¥{{ formatMoney(row.movementAmount) }}</template>
            </el-table-column>
            <el-table-column label="已匹配" align="right" min-width="110">
              <template #default="{row}">¥{{ formatMoney(row.matchedAmount) }}</template>
            </el-table-column>
            <el-table-column label="未匹配" align="right" min-width="110">
              <template #default="{row}">
                <span :style="{ color: Number(row.remainingAmount) > 0 ? 'var(--el-color-warning)' : 'var(--el-text-color-secondary)', fontWeight: Number(row.remainingAmount) > 0 ? 600 : 400 }">
                  ¥{{ formatMoney(row.remainingAmount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column v-if="active.status === 0" label="操作" width="75" fixed="right" align="center">
              <template #default="{row}">
                <el-button v-if="Number(row.remainingAmount) > 0" text type="primary" size="small" @click="openMatchFromEntry(row)">匹配</el-button>
                <span v-else style="color:var(--el-color-success);font-size:12px">已结清</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="匹配明细">
          <el-table :data="active.matches" size="small">
            <el-table-column prop="bankTransaction.transactionNo" label="流水号" min-width="120" />
            <el-table-column prop="voucherEntry.voucher.voucherNo" label="凭证号" min-width="110" />
            <el-table-column label="匹配金额" align="right" min-width="110">
              <template #default="{row}">¥{{ formatMoney(row.matchedAmount) }}</template>
            </el-table-column>
            <el-table-column prop="matchType" label="方式" width="90" />
            <el-table-column label="操作" width="80" align="center">
              <template #default="{row}">
                <el-button v-if="active.status===0" text type="danger" size="small" @click="unmatch(row.id)">解除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </template>

  <el-dialog v-model="createVisible" title="建立银行对账单" width="520px">
    <el-form label-width="130px">
      <el-form-item label="会计期间">
        <el-select v-model="form.periodId" style="width:100%" @change="() => syncCreateOpeningBalance(false)">
          <el-option v-for="row in periods" :key="row.id" :label="row.periodCode" :value="row.id"/>
        </el-select>
      </el-form-item>
      <el-form-item label="银行科目">
        <el-select v-model="form.bankAccountId" filterable style="width:100%" @change="() => syncCreateOpeningBalance(false)">
          <el-option v-for="row in accounts" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/>
        </el-select>
        <div v-if="existingReconciliation" class="form-tip" style="color:var(--el-color-danger);font-size:12px;margin-top:4px">
          ⚠️ 该会计期间与银行科目已存在对账单（{{ existingReconciliation.reconciliationNo }}），无法重复建立
        </div>
      </el-form-item>
      <el-form-item label="银行期初余额">
        <div style="display:flex;gap:8px;width:100%">
          <el-input v-model="form.statementOpeningBalance"/>
          <el-button :loading="loadingPreviousCreate" @click="syncCreateOpeningBalance(true)">带入上期期末</el-button>
        </div>
        <div v-if="previousCreateInfo?.hasPrevious" class="form-tip" style="color:var(--el-text-color-secondary);font-size:12px;margin-top:4px">
          上期（{{previousCreateInfo.periodCode}}）银行期末余额为 ¥{{previousCreateInfo.statementClosingBalance}}
        </div>
        <div v-else-if="previousCreateInfo && !previousCreateInfo.hasPrevious" class="form-tip" style="color:var(--el-text-color-placeholder);font-size:12px;margin-top:4px">
          未查询到上期对账单，可手工输入期初余额
        </div>
      </el-form-item>
      <el-form-item label="银行期末余额">
        <el-input v-model="form.statementClosingBalance"/>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark"/>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createVisible=false">取消</el-button>
      <el-button type="primary" :disabled="Boolean(existingReconciliation)" @click="create">建立</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="editVisible" title="编辑银行对账单" width="520px">
    <el-form label-width="130px">
      <el-form-item label="会计期间"><el-input :model-value="active?.period?.periodCode" disabled/></el-form-item>
      <el-form-item label="银行科目"><el-input :model-value="active ? `${active.bankAccount.code} ${active.bankAccount.name}` : ''" disabled/></el-form-item>
      <el-form-item label="银行期初余额">
        <div style="display:flex;gap:8px;width:100%">
          <el-input v-model="editForm.statementOpeningBalance"/>
          <el-button :loading="loadingPreviousEdit" @click="applyPreviousToEdit">带入上期期末</el-button>
        </div>
        <div v-if="previousEditInfo?.hasPrevious" class="form-tip" style="color:var(--el-text-color-secondary);font-size:12px;margin-top:4px">
          上期（{{previousEditInfo.periodCode}}）银行期末余额为 ¥{{previousEditInfo.statementClosingBalance}}
        </div>
        <div v-else-if="previousEditInfo && !previousEditInfo.hasPrevious" class="form-tip" style="color:var(--el-text-color-placeholder);font-size:12px;margin-top:4px">
          未查询到上期对账单
        </div>
      </el-form-item>
      <el-form-item label="银行期末余额"><el-input v-model="editForm.statementClosingBalance"/></el-form-item>
      <el-form-item label="备注"><el-input v-model="editForm.remark" type="textarea" :rows="3" maxlength="500" show-word-limit/></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="editVisible=false">取消</el-button>
      <el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="matchVisible" title="手工匹配" width="620px">
    <el-form label-width="110px">
      <el-form-item label="银行流水">
        <el-select :model-value="matchForm.bankTransactionId" filterable style="width:100%" @update:model-value="selectTransaction">
          <el-option v-for="row in draftTransactions" :key="row.id" :label="`${formatBusinessDate(row.transactionDate)} ${directionText(row)} ${row.transactionNo} ¥${formatMoney(row.remainingAmount)}`" :value="row.id"/>
        </el-select>
      </el-form-item>
      <el-form-item label="凭证分录">
        <el-select :model-value="matchForm.voucherEntryId" :disabled="!selectedTransaction" filterable style="width:100%" @update:model-value="selectEntry">
          <el-option
            v-for="row in sortedDraftEntries"
            :key="row.id"
            :disabled="row.direction !== selectedDirection"
            :label="`${isEntrySameAmount(row) ? '[金额一致 ⭐] ' : ''}${row.direction !== selectedDirection ? '[方向不符] ' : ''}${row.voucher.voucherNo} ${directionText(row)} ${row.summary} ¥${formatMoney(row.remainingAmount)}`"
            :value="row.id"
          />
        </el-select>
        <div class="form-tip">
          {{ entryHint }}
          <el-button v-if="active?.unpostedBankEntryCount" link type="primary" size="small" style="margin-left:6px" @click="goToVouchers">
            前往凭证审核记账 &rarr;
          </el-button>
        </div>
      </el-form-item>
      <el-form-item label="匹配金额"><el-input v-model="matchForm.matchedAmount"/></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="matchVisible=false">取消</el-button>
      <el-button type="primary" :disabled="!matchForm.bankTransactionId||!matchForm.voucherEntryId" @click="saveMatch">确认匹配</el-button>
    </template>
  </el-dialog>
</div></template>
