<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api } from "../utils/api";
import { todayBusinessDate } from "../utils/date";
import { useClientPagination } from "../composables/useClientPagination";
import { useAuthStore } from "../stores/auth";

type Mode = "receivable" | "payable";
const auth = useAuthStore();
const editor = computed(() => auth.canEditAccounting);
const payer = computed(() => auth.canOperateCash);
const manager = computed(() => auth.canManageAccounting);
const AR_AP_STATUS = { OPEN: 0, PARTIAL: 1, SETTLED: 2 } as const;
const statusLabels: Record<number, string> = { 0: "\u672a\u6838\u9500", 1: "\u90e8\u5206\u6838\u9500", 2: "\u5df2\u6838\u9500" };
const mode = ref<Mode>("receivable"); const customers = ref<any[]>([]); const suppliers = ref<any[]>([]); const documents = ref<any[]>([]); const balances = ref<any[]>([]); const aging = ref<any[]>([]); const summary = ref<any>({ documentCount: 0, outstanding: 0 }); const accounts = ref<any[]>([]); const followUps = ref<any[]>([]); const loading = ref(false); const followUpDialog = ref(false); const followUp = ref({ customerId: "", supplierId: "", scheduledDate: todayBusinessDate(), content: "", result: "" });
const { page, pageSize, total, pagedRows: pagedDocuments, resetPage } = useClientPagination(documents);
const partyDialog = ref(false); const documentDialog = ref(false); const settlementDialog = ref(false); const matchDialog = ref(false); const activeDocument = ref<any>(); const candidates = ref<any[]>([]);
const party = ref({ code: "", name: "", contact: "", phone: "", creditLimit: "" });
const documentForm = ref({ partyId: "", documentNo: "", occurrenceDate: todayBusinessDate(), dueDate: "", amount: "", currency: "CNY", description: "" });
const settlement = ref({ amount: "", paymentDate: todayBusinessDate(), bankAccountId: "", settlementAccountId: "", bankTransactionId: "", remark: "" });
const title = computed(() => mode.value === "receivable" ? "应收账款" : "应付账款"); const parties = computed(() => mode.value === "receivable" ? customers.value : suppliers.value);
const matrixLoading = ref(false);
const agingMatrix = ref<{ buckets: string[]; rows: any[] }>({ buckets: [], rows: [] });
const agingViewType = ref<"list" | "matrix">("matrix");

async function loadAgingMatrix() {
  matrixLoading.value = true;
  try {
    const endpoint = mode.value === "receivable" ? "receivables" : "payables";
    agingMatrix.value = await api.get(`/ar-ap/${endpoint}/aging-matrix`);
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error?.message ?? err?.message ?? "账龄矩阵加载失败");
  } finally {
    matrixLoading.value = false;
  }
}

// 往来对账函
const statementVisible = ref(false);
const statementLoading = ref(false);
const statementParty = ref<any>(null);
const statementDates = ref<string[]>([new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), todayBusinessDate()]);
const statementData = ref<any>(null);

async function openStatement(row: any) {
  statementParty.value = row;
  statementVisible.value = true;
  await fetchStatement();
}

async function fetchStatement() {
  if (!statementParty.value) return;
  statementLoading.value = true;
  try {
    const kind = mode.value === "receivable" ? "customer" : "supplier";
    const [start, end] = statementDates.value;
    statementData.value = await api.get(
      `/ar-ap/statement-of-account?partyId=${statementParty.value.id}&kind=${kind}&startDate=${start}&endDate=${end}`
    );
  } catch (err: any) {
    ElMessage.error(err?.message || "获取对账函失败");
  } finally {
    statementLoading.value = false;
  }
}

function printStatement() {
  window.print();
}

async function load() {
  loading.value = true;
  try {
    const root = mode.value === "receivable" ? "/receivables" : "/payables";
    [documents.value, balances.value, aging.value, summary.value] = await Promise.all([
      api.get<any[]>(`/ar-ap${root}`),
      api.get<any[]>(`/ar-ap${root}/balances`),
      api.get<any[]>(`/ar-ap${root}/aging`),
      api.get<any>(`/ar-ap${root}/summary`),
    ]);
    await loadAgingMatrix();
  } finally {
    loading.value = false;
  }
}
async function loadSupport() { [customers.value, suppliers.value, accounts.value, followUps.value] = await Promise.all([api.get<any[]>("/ar-ap/customers"), api.get<any[]>("/ar-ap/suppliers"), api.get<any[]>("/accounts"), api.get<any[]>("/ar-ap/follow-ups?due=all&status=0")]); }
function switchMode() { resetPage(); load(); }
function openParty() { party.value = { code: "", name: "", contact: "", phone: "", creditLimit: "" }; partyDialog.value = true; }
function openDocument() { documentForm.value = { partyId: "", documentNo: "", occurrenceDate: todayBusinessDate(), dueDate: "", amount: "", currency: "CNY", description: "" }; documentDialog.value = true; }
function openFollowUp() { followUp.value = { customerId: mode.value === "receivable" ? "" : "", supplierId: mode.value === "payable" ? "" : "", scheduledDate: todayBusinessDate(), content: "", result: "" }; followUpDialog.value = true; }
function openSettlement(row: any) { activeDocument.value = row; settlement.value = { amount: String(Number(row.amount) - Number(row.settledAmount)), paymentDate: todayBusinessDate(), bankAccountId: "", settlementAccountId: "", bankTransactionId: "", remark: "" }; settlementDialog.value = true; }
async function suggestMatch(row: any) { const endpoint = mode.value === "receivable" ? "receivables" : "payables"; const result = await api.get<{ matches: any[] }>(`/ar-ap/${endpoint}/${row.id}/bank-matches`); activeDocument.value = row; candidates.value = result.matches; if (!candidates.value.length) return ElMessage.info("没有找到可匹配的未使用银行流水"); matchDialog.value = true; }
function chooseMatch(row: any) { openSettlement(activeDocument.value); settlement.value.bankTransactionId = row.id; settlement.value.amount = String(Math.abs(Number(row.amount))); settlement.value.paymentDate = String(row.transactionDate).slice(0, 10); matchDialog.value = false; }
async function saveParty() { const endpoint = mode.value === "receivable" ? "/customers" : "/suppliers"; await api.post(`/ar-ap${endpoint}`, party.value); partyDialog.value = false; await loadSupport(); ElMessage.success("资料已保存"); }
async function saveDocument() { const endpoint = mode.value === "receivable" ? "/receivables" : "/payables"; await api.post(`/ar-ap${endpoint}`, { ...documentForm.value, dueDate: documentForm.value.dueDate || undefined }); documentDialog.value = false; await load(); ElMessage.success("往来单据已登记"); }
async function saveSettlement() { const suffix = mode.value === "receivable" ? "receipts" : "payments"; await api.post(`/ar-ap/${mode.value === "receivable" ? "receivables" : "payables"}/${activeDocument.value.id}/${suffix}`, { ...settlement.value, bankTransactionId: settlement.value.bankTransactionId || undefined }); settlementDialog.value = false; await load(); ElMessage.success("核销完成，凭证已记账"); }
async function saveFollowUp() { await api.post("/ar-ap/follow-ups", { ...followUp.value, customerId: followUp.value.customerId ? Number(followUp.value.customerId) : undefined, supplierId: followUp.value.supplierId ? Number(followUp.value.supplierId) : undefined }); followUpDialog.value = false; await loadSupport(); ElMessage.success("跟进任务已创建"); }
async function completeFollowUp(row: any) { const result = await ElMessageBox.prompt("请输入跟进结果", "完成跟进", { inputValue: row.result ?? "", inputValidator: (value) => Boolean(value.trim()) || "结果不能为空" }); await api.post(`/ar-ap/follow-ups/${row.id}/complete`, { result: result.value }); await loadSupport(); ElMessage.success("跟进已完成"); }
async function cancelLatest(row:any){const latest=(row.settlements??[]).find((item:any)=>item.status===2);if(!latest)return;const{value}=await ElMessageBox.prompt("请输入撤销原因","撤销核销",{inputPattern:/\S+/,inputErrorMessage:"原因不能为空"});const prefix=mode.value==="receivable"?"receivable-settlements":"payable-settlements";await api.post(`/ar-ap/${prefix}/${latest.id}/cancel`,{reason:value});await load();ElMessage.success("核销已撤销");}
onMounted(async () => { await loadSupport(); await load(); });
</script>
<template>
  <div class="page-grid">
    <section class="page-heading"><div><h2>往来管理</h2><p>登记客户、供应商及其应收应付；收付款核销会自动生成已记账凭证。</p></div><div class="page-actions"><el-button @click="openFollowUp">新增跟进</el-button><el-button v-if="editor" @click="openParty">新增{{ mode === 'receivable' ? '客户' : '供应商' }}</el-button><el-button v-if="editor" type="primary" @click="openDocument">登记{{ title }}</el-button></div></section>
    <el-tabs v-model="mode" @tab-change="switchMode"><el-tab-pane label="应收账款" name="receivable"/><el-tab-pane label="应付账款" name="payable"/></el-tabs>
    <section class="summary-grid"><el-card shadow="never"><div class="metric-label">往来单位</div><strong>{{ balances.length }}</strong></el-card><el-card shadow="never"><div class="metric-label">未核销余额</div><strong>{{ Number(summary.outstanding).toFixed(2) }}</strong></el-card><el-card shadow="never"><div class="metric-label">逾期单据</div><strong>{{ aging.filter(row => row.daysOverdue > 0).length }}</strong></el-card></section>
    <el-card shadow="never"><template #header><b>{{ title }}明细</b></template><el-table table-layout="auto" v-loading="loading" :data="pagedDocuments" stripe><el-table-column prop="documentNo" label="单据编号"/><el-table-column :label="mode === 'receivable' ? '客户' : '供应商'"><template #default="scope">{{ mode === 'receivable' ? scope.row.customer.name : scope.row.supplier.name }}</template></el-table-column><el-table-column prop="occurrenceDate" label="业务日期"/><el-table-column prop="dueDate" label="到期日"/><el-table-column prop="amount" label="金额"/><el-table-column prop="settledAmount" label="已核销"/><el-table-column label="未核销"><template #default="scope">{{ (Number(scope.row.amount) - Number(scope.row.settledAmount)).toFixed(2) }}</template></el-table-column><el-table-column label="状态"><template #default="scope">{{ statusLabels[scope.row.status] ?? scope.row.status }}</template></el-table-column><el-table-column v-if="payer || manager" label="操作"><template #default="scope"><el-button v-if="payer" text :disabled="scope.row.status === AR_AP_STATUS.SETTLED" @click="suggestMatch(scope.row)">匹配流水</el-button><el-button v-if="payer" text type="primary" :disabled="scope.row.status === AR_AP_STATUS.SETTLED" @click="openSettlement(scope.row)">{{ mode === 'receivable' ? '收款' : '付款' }}</el-button><el-button v-if="manager && scope.row.settlements?.some((item:any)=>item.status===2)" text type="danger" @click="cancelLatest(scope.row)">撤销最近核销</el-button></template></el-table-column></el-table><PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total"/></el-card>
    <div class="two-column">
      <el-card shadow="never">
        <template #header>
          <b>{{ mode === 'receivable' ? '客户' : '供应商' }}余额表</b>
        </template>
        <el-table table-layout="auto" :data="balances" size="small">
          <el-table-column prop="code" label="编码" width="90" />
          <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
          <el-table-column prop="outstanding" label="余额" align="right" width="100" />
          <el-table-column prop="creditLimit" label="信用额度" align="right" width="90" />
          <el-table-column label="操作" width="85" align="center">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openStatement(row)">对账函</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <b>账龄分析</b>
            <el-radio-group v-model="agingViewType" size="small">
              <el-radio-button label="matrix">区间矩阵</el-radio-button>
              <el-radio-button label="list">单据明细</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <el-table v-if="agingViewType === 'list'" table-layout="auto" :data="aging" size="small">
          <el-table-column prop="documentNo" label="单据"/>
          <el-table-column prop="party" label="往来单位"/>
          <el-table-column prop="bucket" label="账龄"/>
          <el-table-column prop="outstanding" label="余额"/>
        </el-table>
        <el-table v-else table-layout="auto" v-loading="matrixLoading" :data="agingMatrix.rows" size="small" border>
          <el-table-column prop="partyName" label="往来单位" min-width="110" show-overflow-tooltip />
          <el-table-column prop="totalOutstanding" label="总额" align="right" width="90">
            <template #default="{ row }"><b>{{ row.totalOutstanding }}</b></template>
          </el-table-column>
          <el-table-column label="1-30天" align="right" width="80">
            <template #default="{ row }">{{ row.bucketAmounts ? row.bucketAmounts['0-30'] : '-' }}</template>
          </el-table-column>
          <el-table-column label="31-60天" align="right" width="80">
            <template #default="{ row }">{{ row.bucketAmounts ? row.bucketAmounts['31-60'] : '-' }}</template>
          </el-table-column>
          <el-table-column label="61-90天" align="right" width="80">
            <template #default="{ row }">{{ row.bucketAmounts ? row.bucketAmounts['61-90'] : '-' }}</template>
          </el-table-column>
          <el-table-column label="91-180天" align="right" width="85">
            <template #default="{ row }">{{ row.bucketAmounts ? row.bucketAmounts['91-180'] : '-' }}</template>
          </el-table-column>
          <el-table-column label="181-365天" align="right" width="85">
            <template #default="{ row }">{{ row.bucketAmounts ? row.bucketAmounts['181-365'] : '-' }}</template>
          </el-table-column>
          <el-table-column label=">365天" align="right" width="80">
            <template #default="{ row }"><span style="color:#f56c6c;">{{ row.bucketAmounts ? row.bucketAmounts['>365'] : '-' }}</span></template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
    <el-card shadow="never"><template #header><b>待跟进任务</b></template><el-table :data="followUps" size="small"><el-table-column prop="scheduledDate" label="日期"/><el-table-column label="往来单位"><template #default="scope">{{ scope.row.customer?.name ?? scope.row.supplier?.name }}</template></el-table-column><el-table-column prop="content" label="跟进事项"/><el-table-column label="操作"><template #default="scope"><el-button text type="primary" @click="completeFollowUp(scope.row)">完成</el-button></template></el-table-column></el-table></el-card>
  </div>
  <el-dialog v-model="partyDialog" :title="`新增${mode === 'receivable' ? '客户' : '供应商'}`" width="480px"><el-form label-width="90px"><el-form-item label="编码"><el-input v-model="party.code"/></el-form-item><el-form-item label="名称"><el-input v-model="party.name"/></el-form-item><el-form-item label="联系人"><el-input v-model="party.contact"/></el-form-item><el-form-item label="电话"><el-input v-model="party.phone"/></el-form-item><el-form-item label="信用额度"><el-input v-model="party.creditLimit" placeholder="0 表示不限制"/></el-form-item></el-form><template #footer><el-button @click="partyDialog=false">取消</el-button><el-button type="primary" @click="saveParty">保存</el-button></template></el-dialog>
  <el-dialog v-model="documentDialog" :title="`登记${title}`" width="520px"><el-form label-width="90px"><el-form-item :label="mode === 'receivable' ? '客户' : '供应商'"><el-select v-model="documentForm.partyId" filterable style="width:100%"><el-option v-for="row in parties" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/></el-select></el-form-item><el-form-item label="单据编号"><el-input v-model="documentForm.documentNo"/></el-form-item><el-form-item label="业务日期"><el-date-picker v-model="documentForm.occurrenceDate" value-format="YYYY-MM-DD" type="date"/></el-form-item><el-form-item label="到期日期"><el-date-picker v-model="documentForm.dueDate" value-format="YYYY-MM-DD" type="date"/></el-form-item><el-form-item label="金额"><el-input v-model="documentForm.amount"/></el-form-item><el-form-item label="摘要"><el-input v-model="documentForm.description"/></el-form-item></el-form><template #footer><el-button @click="documentDialog=false">取消</el-button><el-button type="primary" @click="saveDocument">保存</el-button></template></el-dialog>
  <el-dialog v-model="settlementDialog" :title="mode === 'receivable' ? '收款核销' : '付款核销'" width="520px"><el-form label-width="110px"><el-form-item label="收付款金额"><el-input v-model="settlement.amount"/></el-form-item><el-form-item label="收付款日期"><el-date-picker v-model="settlement.paymentDate" value-format="YYYY-MM-DD" type="date"/></el-form-item><el-form-item label="银行科目"><el-select v-model="settlement.bankAccountId" filterable style="width:100%"><el-option v-for="row in accounts" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/></el-select></el-form-item><el-form-item :label="mode === 'receivable' ? '应收科目' : '应付科目'"><el-select v-model="settlement.settlementAccountId" filterable style="width:100%"><el-option v-for="row in accounts" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/></el-select></el-form-item><el-form-item label="备注"><el-input v-model="settlement.remark"/></el-form-item></el-form><template #footer><el-button @click="settlementDialog=false">取消</el-button><el-button type="primary" @click="saveSettlement">确认并记账</el-button></template></el-dialog>
  <el-dialog v-model="matchDialog" title="银行流水匹配" width="720px"><el-table table-layout="auto" :data="candidates" max-height="360"><el-table-column prop="transactionNo" label="流水号"/><el-table-column prop="transactionDate" label="交易日期"/><el-table-column prop="payerName" label="付款方"/><el-table-column prop="payeeName" label="收款方"/><el-table-column prop="amount" label="金额"/><el-table-column label="操作"><template #default="scope"><el-button text type="primary" @click="chooseMatch(scope.row)">选择</el-button></template></el-table-column></el-table></el-dialog>
  <el-dialog v-model="followUpDialog" title="新增跟进任务" width="520px"><el-form label-width="90px"><el-form-item label="客户"><el-select v-model="followUp.customerId" clearable filterable style="width:100%"><el-option v-for="row in customers" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/></el-select></el-form-item><el-form-item label="供应商"><el-select v-model="followUp.supplierId" clearable filterable style="width:100%"><el-option v-for="row in suppliers" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/></el-select></el-form-item><el-form-item label="跟进日期"><el-date-picker v-model="followUp.scheduledDate" value-format="YYYY-MM-DD" type="date"/></el-form-item><el-form-item label="事项"><el-input v-model="followUp.content"/></el-form-item></el-form><template #footer><el-button @click="followUpDialog=false">取消</el-button><el-button type="primary" @click="saveFollowUp">保存</el-button></template></el-dialog>

  <!-- 往来对账函模态框 -->
  <el-dialog v-model="statementVisible" title="往来款项对账确认函" width="820px" destroy-on-close>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <div style="display: flex; gap: 8px; align-items: center;">
        <span style="font-size: 13px; color: #606266;">对账区间：</span>
        <el-date-picker
          v-model="statementDates"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          size="small"
          style="width: 240px;"
          @change="fetchStatement"
        />
        <el-button size="small" type="primary" :loading="statementLoading" @click="fetchStatement">刷新</el-button>
      </div>
      <el-button size="small" type="success" @click="printStatement">打印对账函</el-button>
    </div>

    <div v-loading="statementLoading" class="statement-sheet" style="padding: 20px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff;">
      <div style="text-align: center; margin-bottom: 16px;">
        <h3 style="margin: 0 0 6px 0;">{{ statementData?.company?.name }}</h3>
        <h4 style="margin: 0; color: #606266;">往来款项对账确认函</h4>
      </div>

      <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 12px; color: #303133;">
        <div>
          <div><strong>致：</strong>{{ statementData?.party?.name }}</div>
          <div>统一社会信用代码/税号：{{ statementData?.party?.taxId || '-' }}</div>
          <div>联系人：{{ statementData?.party?.contact || '-' }} ({{ statementData?.party?.phone || '-' }})</div>
        </div>
        <div style="text-align: right;">
          <div><strong>发函单位：</strong>{{ statementData?.company?.name }}</div>
          <div>纳税人识别号：{{ statementData?.company?.taxpayerId || '-' }}</div>
          <div>对账期间：{{ statementData?.period?.startDate }} 至 {{ statementData?.period?.endDate }}</div>
        </div>
      </div>

      <div style="background: #f8f9fa; padding: 10px 14px; border-radius: 4px; margin-bottom: 14px; font-size: 13px; display: flex; justify-content: space-around;">
        <span>期初余额: <b>¥{{ statementData?.openingBalance }}</b></span>
        <span>本期增加: <b style="color: #409eff;">¥{{ statementData?.totalIncrease }}</b></span>
        <span>本期结算: <b style="color: #67c23a;">¥{{ statementData?.totalSettled }}</b></span>
        <span>期末余额: <b style="color: #e6a23c; font-size: 15px;">¥{{ statementData?.closingBalance }}</b></span>
      </div>

      <el-table :data="statementData?.lines || []" size="small" border stripe max-height="300">
        <el-table-column prop="date" label="业务日期" width="105" />
        <el-table-column prop="type" label="单据类型" width="95" />
        <el-table-column prop="documentNo" label="单据编号" width="130" show-overflow-tooltip />
        <el-table-column prop="description" label="摘要说明" min-width="130" show-overflow-tooltip />
        <el-table-column prop="increase" label="应收/付增加" align="right" width="105" />
        <el-table-column prop="settlement" label="结算核销" align="right" width="105" />
        <el-table-column prop="balance" label="结余余额" align="right" width="105" />
      </el-table>

      <div style="margin-top: 24px; display: flex; justify-content: space-between; font-size: 12px; color: #606266; line-height: 2;">
        <div style="width: 45%; border-top: 1px dashed #dcdfe6; padding-top: 8px;">
          <div>本公司签章确认：</div>
          <div style="height: 48px;"></div>
          <div>经办财务（签名）：_____________ 日期：________</div>
        </div>
        <div style="width: 45%; border-top: 1px dashed #dcdfe6; padding-top: 8px;">
          <div>贵公司回执确认签章：</div>
          <div style="color: #909399;">（如无异议请加盖财务章或公章确认并退回）</div>
          <div style="height: 32px;"></div>
          <div>经办人（签名）：_____________ 日期：________</div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>
