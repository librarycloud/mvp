<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Edit } from "@element-plus/icons-vue";
import { api } from "../utils/api";
import { formatBusinessDate } from "../utils/date";
import { useAuthStore } from "../stores/auth";
import { useClientPagination } from "../composables/useClientPagination";

const auth = useAuthStore();
const isAdmin = computed(() => auth.canOperateCash);
const periods = ref<any[]>([]); const accounts = ref<any[]>([]); const rows = ref<any[]>([]); const active = ref<any>();
const { page, pageSize, total, pagedRows } = useClientPagination(rows);
const loading = ref(false); const createVisible = ref(false); const editVisible = ref(false); const matchVisible = ref(false); const editSaving = ref(false);
const directionSavingId = ref<number>();
const form = reactive({ periodId: "" as number | "", bankAccountId: "" as number | "", statementOpeningBalance: "0", statementClosingBalance: "0", remark: "" });
const editForm = reactive({ statementOpeningBalance: "0", statementClosingBalance: "0", remark: "" });
const matchForm = reactive({ bankTransactionId: "" as number | "", voucherEntryId: "" as number | "", matchedAmount: "" });
const draftTransactions = computed(() => active.value?.transactions?.filter((row:any) => Number(row.remainingAmount) > 0) ?? []);
const draftEntries = computed(() => active.value?.entries?.filter((row:any) => Number(row.remainingAmount) > 0) ?? []);
const unknownDirectionCount = computed(() => active.value?.transactions?.filter((row:any) => row.direction === "UNKNOWN").length ?? 0);
const directionLabels: Record<string, string> = { INFLOW: "流入", OUTFLOW: "流出", UNKNOWN: "待确认" };
const directionText = (row:any) => directionLabels[row?.direction] ?? "待确认";
const selectedTransaction = computed(() => draftTransactions.value.find((row:any) => row.id === matchForm.bankTransactionId));
const selectedEntry = computed(() => draftEntries.value.find((row:any) => row.id === matchForm.voucherEntryId));
const selectedDirection = computed(() => selectedTransaction.value?.direction);
const compatibleEntryCount = computed(() => draftEntries.value.filter((row:any) => row.direction === selectedDirection.value).length);
const entryHint = computed(() => {
  if (!selectedTransaction.value) return "请先选择银行流水";
  if (!draftEntries.value.length && active.value?.unpostedBankEntryCount) return `当前有 ${active.value.unpostedBankEntryCount} 条银行科目分录尚未记账，请先在凭证页完成审核和记账`;
  if (!draftEntries.value.length) return "当前期间、所选银行科目下没有可匹配的已记账分录";
  if (!compatibleEntryCount.value) return "已有已记账分录，但借贷方向与所选流水不一致";
  return "只可选择与流水方向一致的已记账分录";
});

async function load() { loading.value = true; try { rows.value = await api.get<any[]>("/bank-reconciliations"); } finally { loading.value = false; } }
async function support() { [periods.value, accounts.value] = await Promise.all([api.get<any[]>("/accounting-periods"), api.get<any[]>("/accounts?tree=false&isEnabled=true")]); accounts.value = accounts.value.filter(row => row.isLeaf && row.code.startsWith("1002")); }
function openCreate() { Object.assign(form, { periodId: periods.value.find(row => row.status === 0)?.id ?? "", bankAccountId: accounts.value[0]?.id ?? "", statementOpeningBalance: "0", statementClosingBalance: "0", remark: "" }); createVisible.value = true; }
async function create() { await api.post("/bank-reconciliations", form); createVisible.value = false; await load(); ElMessage.success("银行对账单已建立"); }
async function open(row:any) { active.value = await api.get(`/bank-reconciliations/${row.id}`); }
function openEdit() { Object.assign(editForm, { statementOpeningBalance: String(active.value.statementOpeningBalance), statementClosingBalance: String(active.value.statementClosingBalance), remark: active.value.remark ?? "" }); editVisible.value = true; }
async function saveEdit() { editSaving.value = true; try { await api.put(`/bank-reconciliations/${active.value.id}`, editForm); editVisible.value = false; await Promise.all([open(active.value), load()]); ElMessage.success("银行对账单已更新"); } finally { editSaving.value = false; } }
function openMatch() { Object.assign(matchForm, { bankTransactionId: "", voucherEntryId: "", matchedAmount: "" }); matchVisible.value = true; }
function selectTransaction(id:number) { matchForm.bankTransactionId = id; matchForm.voucherEntryId = ""; const row = draftTransactions.value.find((item:any) => item.id === id); if (row) matchForm.matchedAmount = row.remainingAmount; }
function selectEntry(id:number) {
  matchForm.voucherEntryId = id;
  const transactionAmount = Number(selectedTransaction.value?.remainingAmount ?? 0);
  const entryAmount = Number(selectedEntry.value?.remainingAmount ?? 0);
  matchForm.matchedAmount = Math.min(transactionAmount, entryAmount).toFixed(2);
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
  <el-card shadow="never"><el-table v-loading="loading" :data="pagedRows" stripe @row-click="open"><el-table-column prop="reconciliationNo" label="对账单号"/><el-table-column prop="period.periodCode" label="期间"/><el-table-column label="银行科目"><template #default="{row}">{{row.bankAccount.code}} {{row.bankAccount.name}}</template></el-table-column><el-table-column prop="statementClosingBalance" label="银行期末余额"/><el-table-column prop="bookClosingBalance" label="账面期末余额"/><el-table-column prop="difference" label="差额"/><el-table-column label="状态"><template #default="{row}"><el-tag :type="row.status===1?'success':'warning'">{{row.status===1?'已完成':'对账中'}}</el-tag></template></el-table-column></el-table><PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total"/></el-card>
  <template v-if="active"><section class="page-heading"><div><h3>{{active.reconciliationNo}}</h3><p>{{active.bankAccount.code}} {{active.bankAccount.name}} · {{active.period.periodCode}}</p></div><div class="toolbar"><el-button v-if="active.status===0" :icon="Edit" @click="openEdit">编辑</el-button><el-button v-if="active.status===0" @click="autoMatch">自动匹配</el-button><el-button v-if="active.status===0" type="primary" @click="openMatch">手工匹配</el-button><el-button v-if="active.status===0&&isAdmin" type="success" @click="complete">完成对账</el-button><el-button v-if="active.status===1&&isAdmin" @click="reopen">重新打开</el-button></div></section>
    <el-alert v-if="!active.companyBankAccount" type="warning" :closable="false" show-icon title="请先在发票页面的企业资料中填写银行账号，系统才能识别流水的流入和流出方向。"/>
    <el-alert v-else-if="unknownDirectionCount" type="warning" :closable="false" show-icon :title="`有 ${unknownDirectionCount} 条金额为零的流水无法自动识别，请在下方方向列人工确认。`"/>
    <section class="summary-grid"><el-card shadow="never"><div class="metric-label">未匹配流水</div><strong>{{draftTransactions.length}}</strong></el-card><el-card shadow="never"><div class="metric-label">未匹配分录</div><strong>{{draftEntries.length}}</strong></el-card><el-card shadow="never"><div class="metric-label">未匹配金额差额</div><strong>{{active.matchingDifference ?? '-'}}</strong></el-card><el-card shadow="never"><div class="metric-label">余额差额</div><strong>{{active.difference}}</strong></el-card></section>
    <el-card shadow="never"><el-tabs><el-tab-pane label="银行流水"><el-table :data="active.transactions" size="small"><el-table-column label="日期" width="110"><template #default="{row}">{{formatBusinessDate(row.transactionDate)}}</template></el-table-column><el-table-column prop="transactionNo" label="流水号"/><el-table-column prop="summary" label="摘要"/><el-table-column label="方向" width="120"><template #default="{row}"><el-tag v-if="row.direction!=='UNKNOWN'" :type="row.direction==='INFLOW'?'success':'danger'">{{directionText(row)}}</el-tag><el-select v-else :model-value="''" :disabled="active.status!==0" :loading="directionSavingId===row.id" placeholder="待确认" size="small" style="width:90px" @change="(value:any)=>confirmDirection(row,value)"><el-option label="流入" value="INFLOW"/><el-option label="流出" value="OUTFLOW"/></el-select></template></el-table-column><el-table-column prop="amount" label="金额"/><el-table-column prop="matchedAmount" label="已匹配"/><el-table-column prop="remainingAmount" label="未匹配"/></el-table></el-tab-pane><el-tab-pane label="账面分录"><el-table :data="active.entries" size="small"><el-table-column label="日期" width="110"><template #default="{row}">{{formatBusinessDate(row.voucher.postingDate)}}</template></el-table-column><el-table-column prop="voucher.voucherNo" label="凭证号"/><el-table-column prop="summary" label="摘要"/><el-table-column label="方向"><template #default="{row}">{{directionText(row)}}</template></el-table-column><el-table-column prop="movementAmount" label="金额"/><el-table-column prop="matchedAmount" label="已匹配"/><el-table-column prop="remainingAmount" label="未匹配"/></el-table></el-tab-pane><el-tab-pane label="匹配明细"><el-table :data="active.matches" size="small"><el-table-column prop="bankTransaction.transactionNo" label="流水号"/><el-table-column prop="voucherEntry.voucher.voucherNo" label="凭证号"/><el-table-column prop="matchedAmount" label="匹配金额"/><el-table-column prop="matchType" label="方式"/><el-table-column label="操作"><template #default="{row}"><el-button v-if="active.status===0" text type="danger" @click="unmatch(row.id)">解除</el-button></template></el-table-column></el-table></el-tab-pane></el-tabs></el-card>
  </template>
  <el-dialog v-model="createVisible" title="建立银行对账单" width="520px"><el-form label-width="130px"><el-form-item label="会计期间"><el-select v-model="form.periodId" style="width:100%"><el-option v-for="row in periods" :key="row.id" :label="row.periodCode" :value="row.id"/></el-select></el-form-item><el-form-item label="银行科目"><el-select v-model="form.bankAccountId" filterable style="width:100%"><el-option v-for="row in accounts" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/></el-select></el-form-item><el-form-item label="银行期初余额"><el-input v-model="form.statementOpeningBalance"/></el-form-item><el-form-item label="银行期末余额"><el-input v-model="form.statementClosingBalance"/></el-form-item><el-form-item label="备注"><el-input v-model="form.remark"/></el-form-item></el-form><template #footer><el-button @click="createVisible=false">取消</el-button><el-button type="primary" @click="create">建立</el-button></template></el-dialog>
  <el-dialog v-model="editVisible" title="编辑银行对账单" width="520px"><el-form label-width="130px"><el-form-item label="会计期间"><el-input :model-value="active?.period?.periodCode" disabled/></el-form-item><el-form-item label="银行科目"><el-input :model-value="active ? `${active.bankAccount.code} ${active.bankAccount.name}` : ''" disabled/></el-form-item><el-form-item label="银行期初余额"><el-input v-model="editForm.statementOpeningBalance"/></el-form-item><el-form-item label="银行期末余额"><el-input v-model="editForm.statementClosingBalance"/></el-form-item><el-form-item label="备注"><el-input v-model="editForm.remark" type="textarea" :rows="3" maxlength="500" show-word-limit/></el-form-item></el-form><template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button></template></el-dialog>
  <el-dialog v-model="matchVisible" title="手工匹配" width="600px"><el-form label-width="110px"><el-form-item label="银行流水"><el-select :model-value="matchForm.bankTransactionId" filterable style="width:100%" @update:model-value="selectTransaction"><el-option v-for="row in draftTransactions" :key="row.id" :label="`${formatBusinessDate(row.transactionDate)} ${directionText(row)} ${row.transactionNo} ¥${row.remainingAmount}`" :value="row.id"/></el-select></el-form-item><el-form-item label="凭证分录"><el-select :model-value="matchForm.voucherEntryId" :disabled="!selectedTransaction" filterable style="width:100%" @update:model-value="selectEntry"><el-option v-for="row in draftEntries" :key="row.id" :disabled="row.direction!==selectedDirection" :label="`${row.direction!==selectedDirection?'[方向不符] ':''}${row.voucher.voucherNo} ${directionText(row)} ${row.summary} ¥${row.remainingAmount}`" :value="row.id"/></el-select><div class="form-tip">{{entryHint}}</div></el-form-item><el-form-item label="匹配金额"><el-input v-model="matchForm.matchedAmount"/></el-form-item></el-form><template #footer><el-button @click="matchVisible=false">取消</el-button><el-button type="primary" :disabled="!matchForm.bankTransactionId||!matchForm.voucherEntryId" @click="saveMatch">确认匹配</el-button></template></el-dialog>
</div></template>
