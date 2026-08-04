<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api } from "../utils/api";
import { useClientPagination } from "../composables/useClientPagination";
import { useAuthStore } from "../stores/auth";

type Tab = "input" | "output" | "foundation" | "declarations";
type TaxType = "VAT" | "SURCHARGE" | "CORPORATE_INCOME";
const auth = useAuthStore();
const tab = ref<Tab>("input"); const year = ref(new Date().getFullYear()); const periodType = ref("MONTH"); const period = ref(new Date().getMonth() + 1);
const rows = ref<any[]>([]); const declarations = ref<any[]>([]); const summary = ref<any>(); const loading = ref(false); const active = ref<any>(); const detailVisible = ref(false);
const simpleMode = ref(true);
const { page, pageSize, total, pagedRows, resetPage } = useClientPagination(rows);
const periodOptions = computed(() => periodType.value === "MONTH" ? 12 : periodType.value === "QUARTER" ? 4 : 0);
const editor = computed(() => ["ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"].includes(auth.user?.role ?? ""));
const manager = computed(() => ["ADMIN", "FINANCE_MANAGER"].includes(auth.user?.role ?? ""));
const payer = computed(() => ["ADMIN", "FINANCE_MANAGER", "CASHIER"].includes(auth.user?.role ?? ""));
const query = () => new URLSearchParams({ periodType: periodType.value, fiscalYear: String(year.value), ...(periodType.value === "YEAR" ? {} : { period: String(period.value) }) });
const money = (value: string | number | null | undefined) => Number(value ?? 0).toFixed(2);
const statusLabel: Record<string, string> = { DRAFT: "草稿", REVIEWED: "已复核", DECLARED: "已申报", PAID: "已缴款" };
const statusType: Record<string, "info" | "warning" | "success"> = { DRAFT: "info", REVIEWED: "warning", DECLARED: "success", PAID: "success" };
const taxTypeLabel: Record<TaxType, string> = { VAT: "增值税", SURCHARGE: "附加税", CORPORATE_INCOME: "企业所得税" };

async function load() {
  resetPage(); loading.value = true;
  try {
    if (tab.value === "foundation") {
      const [foundation, input] = await Promise.all([api.get(`/tax/foundation?${query()}`), api.get<any[]>(`/tax/input-ledger?${query()}`)]);
      summary.value = foundation; rows.value = input;
    } else if (tab.value === "declarations") {
      declarations.value = await api.get<any[]>(`/tax/declarations?${query()}`);
    } else rows.value = await api.get<any[]>(`/tax/${tab.value}-ledger?${query()}`);
  } finally { loading.value = false; }
}
async function prepare(type: TaxType) { active.value = await api.post<any>("/tax/declarations", { taxType: type, periodType: periodType.value, fiscalYear: year.value, ...(periodType.value === "YEAR" ? {} : { period: period.value }) }); detailVisible.value = true; await load(); ElMessage.success("申报底稿已生成"); }
async function inspect(row: any) { active.value = await api.get(`/tax/declarations/${row.id}`); detailVisible.value = true; }
async function adjust(line: any) { if (!active.value) return; const result = await ElMessageBox.prompt(`调整 ${line.lineName}，可填正数或负数`, "税务申报调整", { inputValue: String(line.adjustment), inputPattern: /^-?\d{1,15}(?:\.\d{1,4})?$/, inputErrorMessage: "金额格式无效" }); active.value = await api.put(`/tax/declarations/${active.value.id}/lines`, { lines: [{ lineCode: line.lineCode, adjustmentAmount: result.value }] }); await load(); }
async function review() { active.value = await api.post(`/tax/declarations/${active.value.id}/review`); await load(); }
async function declare() { const result = await ElMessageBox.prompt("填写申报编号或回执编号", "登记税务申报", { inputPattern: /\S+/, inputErrorMessage: "编号不能为空" }); active.value = await api.post(`/tax/declarations/${active.value.id}/declare`, { declarationNo: result.value }); await load(); }
async function pay() { const amount = money(active.value.declaredAmount); const result = await ElMessageBox.prompt("填写本次缴款金额", "登记税款缴纳", { inputValue: amount, inputPattern: /^\d{1,15}(?:\.\d{1,4})?$/, inputErrorMessage: "金额格式无效" }); active.value = await api.post(`/tax/declarations/${active.value.id}/payments`, { amount: result.value, paymentDate: new Date().toISOString().slice(0, 10) }); await load(); }
function changeType() { period.value = 1; load(); }
onMounted(async () => { const profile = await api.get<any>("/company-profile"); simpleMode.value = (profile?.operationMode ?? "SIMPLE") === "SIMPLE"; await load(); });
</script>

<template>
  <div class="page-grid">
    <section class="page-heading"><div><h2>税务台账与申报</h2><p>{{simpleMode ? '简易模式下可从底稿直接登记申报和缴款。' : '从进销项台账生成申报底稿，完成复核、申报登记与税款缴纳追溯。'}}</p></div><div class="toolbar"><el-select v-model="periodType" style="width:110px" @change="changeType"><el-option label="月度" value="MONTH"/><el-option label="季度" value="QUARTER"/><el-option label="年度" value="YEAR"/></el-select><el-input-number v-model="year" :min="2000" :max="9999"/><el-select v-if="periodType !== 'YEAR'" v-model="period" style="width:100px"><el-option v-for="n in periodOptions" :key="n" :label="periodType === 'MONTH' ? `${n}月` : `第${n}季度`" :value="n"/></el-select><el-button type="primary" @click="load">查询</el-button></div></section>
    <el-card shadow="never"><el-tabs v-model="tab" @tab-change="load"><el-tab-pane label="进项税台账" name="input"/><el-tab-pane label="销项税台账" name="output"/><el-tab-pane label="纳税基础表" name="foundation"/><el-tab-pane label="税务申报" name="declarations"/></el-tabs></el-card>
    <template v-if="tab === 'declarations'"><el-card v-if="editor" shadow="never"><div class="toolbar"><el-button type="primary" @click="prepare('VAT')">生成增值税底稿</el-button><el-button @click="prepare('SURCHARGE')">生成附加税底稿</el-button><el-button @click="prepare('CORPORATE_INCOME')">生成所得税底稿</el-button></div></el-card><el-card shadow="never"><el-table v-loading="loading" :data="declarations" stripe><el-table-column label="税种" width="130"><template #default="{row}">{{taxTypeLabel[row.taxType as TaxType]}}</template></el-table-column><el-table-column label="期间"><template #default="{row}">{{String(row.periodStart).slice(0,10)}} 至 {{String(row.periodEnd).slice(0,10)}}</template></el-table-column><el-table-column prop="payableAmount" label="应缴金额" align="right"/><el-table-column label="状态" width="110"><template #default="{row}"><el-tag :type="statusType[row.status]">{{statusLabel[row.status]}}</el-tag></template></el-table-column><el-table-column prop="declarationNo" label="申报编号"/><el-table-column label="操作" width="90"><template #default="{row}"><el-button link type="primary" @click="inspect(row)">查看</el-button></template></el-table-column></el-table></el-card></template>
    <template v-else-if="tab === 'foundation' && summary"><section class="metric-grid"><div class="metric"><span>预计应缴增值税</span><strong>{{money(Math.max(0, Number(summary.taxPayableBeforeOtherAdjustments)))}}</strong></div><div class="metric"><span>预计留抵税额</span><strong>{{money(Math.max(0, -Number(summary.taxPayableBeforeOtherAdjustments)))}}</strong></div><div class="metric"><span>销项税额</span><strong>{{money(summary.output.tax)}}</strong></div><div class="metric"><span>已确认可抵扣进项</span><strong>{{money(summary.input.deductibleTax)}}</strong></div></section><el-card shadow="never"><el-descriptions :column="3" border><el-descriptions-item label="期间">{{String(summary.startDate).slice(0,10)}} 至 {{String(summary.endDate).slice(0,10)}}</el-descriptions-item><el-descriptions-item label="进项税额">{{money(summary.input.tax)}}</el-descriptions-item><el-descriptions-item label="销项价税合计">{{money(summary.output.includedAmount)}}</el-descriptions-item><el-descriptions-item label="税额差额">{{money(summary.taxPayableBeforeOtherAdjustments)}}</el-descriptions-item><el-descriptions-item label="说明">申报前仍可通过底稿行次调整减免、留抵和其他申报差异。</el-descriptions-item></el-descriptions></el-card></template>
    <el-card v-if="tab !== 'declarations' && tab !== 'foundation'" shadow="never"><el-table v-loading="loading" :data="pagedRows" stripe><el-table-column prop="issueDate" label="开票日期" width="115"><template #default="{row}">{{String(row.issueDate).slice(0,10)}}</template></el-table-column><el-table-column prop="invoiceNumber" label="发票号码" min-width="170"/><el-table-column prop="sellerName" label="销售方" min-width="180" show-overflow-tooltip/><el-table-column prop="buyerName" label="购买方" min-width="180" show-overflow-tooltip/><el-table-column prop="totalAmountWithoutTax" label="不含税金额" align="right"/><el-table-column prop="totalTaxAmount" label="税额" align="right"/><el-table-column prop="totalTaxIncludedAmount" label="价税合计" align="right"/><el-table-column v-if="tab === 'input'" prop="deductibleTaxAmount" label="可抵扣税额" align="right"/></el-table><PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total"/></el-card>
    <el-drawer v-model="detailVisible" title="税务申报底稿" size="680px"><template v-if="active"><el-descriptions :column="2" border><el-descriptions-item label="税种">{{taxTypeLabel[active.taxType as TaxType]}}</el-descriptions-item><el-descriptions-item label="状态"><el-tag :type="statusType[active.status]">{{statusLabel[active.status]}}</el-tag></el-descriptions-item><el-descriptions-item label="申报期间">{{String(active.periodStart).slice(0,10)}} 至 {{String(active.periodEnd).slice(0,10)}}</el-descriptions-item><el-descriptions-item label="申报编号">{{active.declarationNo ?? '-'}}</el-descriptions-item><el-descriptions-item label="应缴金额">{{money(active.declaredAmount)}}</el-descriptions-item></el-descriptions><el-table :data="active.lines" stripe class="declaration-lines"><el-table-column prop="lineName" label="行次"/><el-table-column prop="calculated" label="自动取数" align="right"/><el-table-column prop="adjustment" label="调整" align="right"/><el-table-column prop="declared" label="申报金额" align="right"/><el-table-column v-if="editor && active.status === 'DRAFT'" label="操作" width="80"><template #default="{row}"><el-button link type="primary" @click="adjust(row)">调整</el-button></template></el-table-column></el-table><div class="drawer-actions"><el-button v-if="manager && !simpleMode && active.status === 'DRAFT'" @click="review">复核</el-button><el-button v-if="manager && ((simpleMode && active.status === 'DRAFT') || active.status === 'REVIEWED')" type="primary" @click="declare">登记申报</el-button><el-button v-if="payer && active.status === 'DECLARED' && Number(active.declaredAmount) > 0" type="primary" @click="pay">登记缴款</el-button></div><h3>缴款记录</h3><el-table :data="active.payments" size="small"><el-table-column prop="paymentDate" label="日期"><template #default="{row}">{{String(row.paymentDate).slice(0,10)}}</template></el-table-column><el-table-column prop="amount" label="金额"/><el-table-column prop="paymentReference" label="缴款编号"/></el-table></template></el-drawer>
  </div>
</template>

<style scoped>
.declaration-lines { margin-top: 18px; }
.drawer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
