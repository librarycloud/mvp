<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useAuthStore } from "../stores/auth";
import { api } from "../utils/api";
import { formatBusinessDate, formatOperationTime, todayBusinessDate } from "../utils/date";

type Status = 0 | 1 | 2 | 3 | 4;
type TaxDeductionStatus = 0 | 1 | 2 | 3;
type EvidenceType = 0 | 1 | 2;
type VoucherStatus = 0 | 1 | 2 | 3;
type VoucherCategory = "RECEIPT" | "PAYMENT" | "TRANSFER" | "ACCRUAL" | "CLOSING" | "OTHER";
interface AccountOption { id: number; code: string; name: string; isLeaf: boolean; isEnabled: boolean; }
interface ImportedInvoice { id: number; invoiceNumber: string; issueTime: string; sellerName: string; buyerName: string; buyerIdNum: string; totalAmountWithoutTax: string; totalTaxAmount: string; totalTaxIncludedAmount: string; taxDeductionStatus: TaxDeductionStatus; deductibleTaxAmount: string; currency: string; }
interface ExpenseTypeOption { id: number; code: string; name: string; value: string; isDefault: boolean; enabled: boolean; }
interface TaxTreatment { deductionStatus: TaxDeductionStatus; deductibleTaxAmount: string; }

const auth = useAuthStore();
const isAdmin = computed(() => auth.canManageAccounting);
const canPay = computed(() => auth.canOperateCash);
const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const accounts = ref<AccountOption[]>([]);
const expenseTypes = ref<ExpenseTypeOption[]>([]);
const availableInvoices = ref<ImportedInvoice[]>([]);
const availableBankTransactions = ref<any[]>([]);
const invoiceLoading = ref(false);
const summary = ref<any>({});
const loading = ref(false);
const dialogVisible = ref(false);
const detailVisible = ref(false);
const voucherDetailVisible = ref(false);
const bankTransactionDetailVisible = ref(false);
const payVisible = ref(false);
const active = ref<any>();
const voucherDetail = ref<any>();
const bankTransactionDetail = ref<any>();
const voucherDetailLoading = ref(false);
const bankTransactionDetailLoading = ref(false);
const formId = ref<number | "">("");
const existingAttachments = ref<any[]>([]);
const stagedFiles = ref<File[]>([]);
const attachmentPreviewVisible = ref(false);
const attachmentPreviewUrl = ref("");
const attachmentPreviewName = ref("");
const attachmentPreviewMime = ref("");
const filters = reactive({ status: "", keyword: "", dateFrom: "", dateTo: "" });
const form = reactive({ applicantName: "", department: "", expenseDate: todayBusinessDate(), expenseType: "", amount: "", currency: "CNY", description: "", evidenceType: 0 as EvidenceType, evidenceDescription: "", invoiceIds: [] as number[] });
const taxTreatments = reactive<Record<number, TaxTreatment>>({});
const payForm = reactive({ paymentDate: todayBusinessDate(), expenseAccountId: "" as number | "", inputTaxAccountId: "" as number | "", paymentAccountId: "" as number | "", bankTransactionId: "" as number | "", remark: "" });

const STATUS = { DRAFT: 0, PENDING: 1, APPROVED: 2, REJECTED: 3, PAID: 4 } as const;
const labels: Record<Status, string> = { 0: "草稿", 1: "待审批", 2: "已通过", 3: "已驳回", 4: "已付款" };
const colors: Record<Status, "info" | "warning" | "success" | "danger" | "primary"> = { 0: "info", 1: "warning", 2: "success", 3: "danger", 4: "primary" };
const taxLabels: Record<TaxDeductionStatus, string> = { 0: "待确认", 1: "全额抵扣", 2: "不抵扣", 3: "部分抵扣" };
const EVIDENCE_TYPE = { INVOICE: 0, OTHER: 1, NO_INVOICE: 2 } as const;
const evidenceLabels: Record<EvidenceType, string> = { 0: "发票", 1: "其他凭证", 2: "无票支出" };
const evidenceOptions = Object.entries(evidenceLabels).map(([value, label]) => ({ value: Number(value), label }));
const voucherStatusLabels: Record<VoucherStatus, string> = { 0: "草稿", 1: "待审核", 2: "已记账", 3: "作废" };
const voucherStatusColors: Record<VoucherStatus, "info" | "warning" | "success" | "danger"> = { 0: "info", 1: "warning", 2: "success", 3: "danger" };
const voucherCategoryLabels: Record<VoucherCategory, string> = { RECEIPT: "收款", PAYMENT: "付款", TRANSFER: "转账", ACCRUAL: "计提", CLOSING: "结转", OTHER: "其他" };
const postableAccounts = computed(() => accounts.value.filter(row => row.isLeaf && row.isEnabled));
const inputTaxAccounts = computed(() => postableAccounts.value.filter(row => row.code === "22210101"));
const selectedInvoices = computed(() => form.invoiceIds.flatMap(id => {
  const invoice = availableInvoices.value.find(row => row.id === id);
  return invoice ? [invoice] : [];
}));
const invoiceTotal = computed(() => selectedInvoices.value.reduce((sum, row) => sum + Number(row.totalTaxIncludedAmount), 0));
const deductibleTaxTotal = computed(() => form.invoiceIds.reduce((sum, id) => sum + Number(taxTreatments[id]?.deductibleTaxAmount ?? 0), 0));
const activeDeductibleTaxTotal = computed(() => (active.value?.invoices ?? []).reduce((sum: number, row: ImportedInvoice) => sum + Number(row.deductibleTaxAmount), 0));
const defaultExpenseType = computed(() => expenseTypes.value.find(row => row.isDefault)?.value ?? expenseTypes.value[0]?.value ?? "");
const isInvoiceEvidence = computed(() => form.evidenceType === EVIDENCE_TYPE.INVOICE);

function money(value: unknown) { return Number(value ?? 0).toFixed(2); }
function date(value: string | null) { return value ? String(value).slice(0, 10) : "-"; }
function clearTaxTreatments() { Object.keys(taxTreatments).forEach(key => delete taxTreatments[Number(key)]); }
function resetForm() { formId.value = ""; clearTaxTreatments(); existingAttachments.value = []; stagedFiles.value = []; Object.assign(form, { applicantName: auth.user?.displayName ?? "", department: "", expenseDate: todayBusinessDate(), expenseType: defaultExpenseType.value, amount: "", currency: "CNY", description: "", evidenceType: EVIDENCE_TYPE.INVOICE, evidenceDescription: "", invoiceIds: [] }); }
function allInvoiceRows(row: any) { return (row.invoices ?? []).map((invoice: ImportedInvoice) => ({ invoiceTitle: invoice.buyerName, invoiceTaxId: invoice.buyerIdNum, invoiceNumber: invoice.invoiceNumber, invoiceDate: invoice.issueTime, invoiceAmount: invoice.totalTaxIncludedAmount, sellerName: invoice.sellerName, taxDeductionStatus: invoice.taxDeductionStatus, deductibleTaxAmount: invoice.deductibleTaxAmount })); }
function evidenceText(row: any) { const type = Number(row.evidenceType ?? EVIDENCE_TYPE.INVOICE) as EvidenceType; return type === EVIDENCE_TYPE.INVOICE ? `${allInvoiceRows(row).length} 张发票` : evidenceLabels[type] ?? "-"; }
function fileSize(value: unknown) { const size = Number(value ?? 0); return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function canPreviewAttachment(row: any) { const mime = String(row.attachment?.mimeType ?? "").toLowerCase(); return ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "application/pdf"].includes(mime); }
async function previewAttachment(row: any) {
  closeAttachmentPreview();
  const blob = await api.blob(`/attachments/${row.attachment.id}/content`);
  attachmentPreviewUrl.value = URL.createObjectURL(blob);
  attachmentPreviewName.value = row.attachment.originalName;
  attachmentPreviewMime.value = blob.type || row.attachment.mimeType;
  attachmentPreviewVisible.value = true;
}
function closeAttachmentPreview() {
  attachmentPreviewVisible.value = false;
  if (attachmentPreviewUrl.value) URL.revokeObjectURL(attachmentPreviewUrl.value);
  attachmentPreviewUrl.value = "";
  attachmentPreviewName.value = "";
  attachmentPreviewMime.value = "";
}
function downloadAttachment(row: any) { return api.download(`/attachments/${row.attachment.id}/content`, row.attachment.originalName); }
function ensureTaxTreatment(invoice: ImportedInvoice) {
  taxTreatments[invoice.id] ??= {
    deductionStatus: Number(invoice.totalTaxAmount) === 0 ? 2 : invoice.taxDeductionStatus,
    deductibleTaxAmount: Number(invoice.totalTaxAmount) === 0 ? "0" : String(invoice.deductibleTaxAmount ?? "0"),
  };
}
function updateTaxStatus(invoice: ImportedInvoice) {
  const treatment = taxTreatments[invoice.id];
  if (!treatment) return;
  if (treatment.deductionStatus === 1) treatment.deductibleTaxAmount = String(invoice.totalTaxAmount);
  else if (treatment.deductionStatus !== 3) treatment.deductibleTaxAmount = "0";
}

async function load(resetPage = false) {
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const query = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) });
    if (filters.status) query.set("status", filters.status);
    if (filters.keyword) query.set("keyword", filters.keyword);
    if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) query.set("dateTo", filters.dateTo);
    const [data, summaryData] = await Promise.all([api.get<any>(`/reimbursements?${query}`), api.get<any>("/reimbursements/summary")]);
    rows.value = data.items;
    total.value = data.total;
    summary.value = summaryData;
  } finally { loading.value = false; }
}

async function support() {
  [accounts.value, expenseTypes.value] = await Promise.all([
    api.get<AccountOption[]>("/accounts?tree=false&isEnabled=true"),
    api.get<ExpenseTypeOption[]>("/dictionary/reimbursement_expense_type"),
  ]);
}
async function loadAvailableInvoices(keyword = "", reimbursementId = formId.value) {
  invoiceLoading.value = true;
  try {
    const query = new URLSearchParams();
    if (keyword) query.set("keyword", keyword);
    if (reimbursementId) query.set("reimbursementId", String(reimbursementId));
    const rows = await api.get<ImportedInvoice[]>(`/reimbursements/available-invoices?${query}`);
    const selected = availableInvoices.value.filter(row => form.invoiceIds.includes(row.id));
    availableInvoices.value = [...new Map([...selected, ...rows].map(row => [row.id, row])).values()];
    availableInvoices.value.filter(row => form.invoiceIds.includes(row.id)).forEach(ensureTaxTreatment);
  } finally { invoiceLoading.value = false; }
}
async function openCreate() { resetForm(); availableInvoices.value = []; await loadAvailableInvoices(); dialogVisible.value = true; }
async function openEdit(row: any) {
  if (row.status === STATUS.PAID) return ElMessage.warning("已付款报销单请先撤销付款再编辑");
  if ([STATUS.PENDING, STATUS.APPROVED].includes(row.status)) {
    try {
      await ElMessageBox.confirm("修改后报销单将退回草稿，原审批结果失效，需要重新提交审批。是否继续？", "编辑报销单", { type: "warning" });
    } catch { return; }
  }
  formId.value = row.id;
  clearTaxTreatments();
  stagedFiles.value = [];
  Object.assign(form, { applicantName: row.applicantName, department: row.department ?? "", expenseDate: date(row.expenseDate), expenseType: row.expenseType, amount: String(row.amount), currency: row.currency, description: row.description ?? "", evidenceType: Number(row.evidenceType ?? EVIDENCE_TYPE.INVOICE), evidenceDescription: row.evidenceDescription ?? "", invoiceIds: (row.invoices ?? []).map((item: ImportedInvoice) => item.id) });
  availableInvoices.value = [];
  const requests: Promise<unknown>[] = [loadAttachments(row.id)];
  if (form.evidenceType === EVIDENCE_TYPE.INVOICE) requests.push(loadAvailableInvoices("", row.id));
  await Promise.all(requests);
  dialogVisible.value = true;
}
async function changeEvidenceType() {
  form.invoiceIds = [];
  clearTaxTreatments();
  if (form.evidenceType === EVIDENCE_TYPE.INVOICE) {
    form.evidenceDescription = "";
    await loadAvailableInvoices();
  }
}
function selectSupportingFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  stagedFiles.value = [...stagedFiles.value, ...Array.from(input.files ?? [])];
  input.value = "";
}
function removeStagedFile(index: number) { stagedFiles.value.splice(index, 1); }
async function loadAttachments(id: number) { existingAttachments.value = await api.get<any[]>(`/attachments/source/Reimbursement/${id}`); }
async function uploadStagedFiles(id: number) {
  const category = form.evidenceType === EVIDENCE_TYPE.NO_INVOICE ? "NO_INVOICE_PROOF" : "OTHER_EVIDENCE";
  const query = new URLSearchParams({ sourceType: "Reimbursement", sourceId: String(id), relationType: "RECEIPT", category });
  for (const file of stagedFiles.value) await api.upload(`/attachments/upload?${query}`, file);
  stagedFiles.value = [];
  await loadAttachments(id);
}
async function removeAttachment(row: any) {
  try { await ElMessageBox.confirm(`确定移除附件“${row.attachment.originalName}”吗？`, "移除附件", { type: "warning" }); }
  catch { return; }
  await api.delete(`/attachments/relations/${row.id}`);
  const id = detailVisible.value && active.value ? Number(active.value.id) : Number(formId.value);
  if (id) await loadAttachments(id);
}
function updateInvoiceTotal() {
  selectedInvoices.value.forEach(ensureTaxTreatment);
  form.amount = invoiceTotal.value ? invoiceTotal.value.toFixed(2) : "";
}
async function save() {
  if (!form.expenseType) return ElMessage.warning("请选择费用类型");
  if (!Number(form.amount) || Number(form.amount) <= 0) return ElMessage.warning("请填写大于零的报销金额");
  if (isInvoiceEvidence.value && !form.invoiceIds.length) return ElMessage.warning("请至少选择一张已导入发票");
  if (isInvoiceEvidence.value && Number(form.amount || 0) > invoiceTotal.value) return ElMessage.warning("报销金额不能超过发票合计金额");
  if (!isInvoiceEvidence.value && !form.evidenceDescription.trim()) return ElMessage.warning(form.evidenceType === EVIDENCE_TYPE.NO_INVOICE ? "请填写无票原因" : "请填写其他凭证说明");
  const invoiceIds = isInvoiceEvidence.value ? form.invoiceIds : [];
  const invoiceTaxTreatments = isInvoiceEvidence.value ? form.invoiceIds.map(invoiceId => ({ invoiceId, ...taxTreatments[invoiceId] })) : [];
  const payload = { ...form, invoiceIds, invoiceTaxTreatments };
  const saved = formId.value
    ? await api.put<any>(`/reimbursements/${formId.value}`, payload)
    : await api.post<any>("/reimbursements", payload);
  formId.value = saved.id;
  if (stagedFiles.value.length) await uploadStagedFiles(saved.id);
  dialogVisible.value = false;
  ElMessage.success("报销单已保存");
  await load();
}
async function transition(row: any, action: string, message: string, body?: unknown) { await api.post(`/reimbursements/${row.id}/${action}`, body); ElMessage.success(message); await load(); }
async function showDetail(row: any) { active.value = await api.get(`/reimbursements/${row.id}`); await loadAttachments(row.id); detailVisible.value = true; }
async function showVoucherDetail() {
  const id = Number(active.value?.voucher?.id);
  if (!id) return;
  voucherDetailVisible.value = true;
  voucherDetailLoading.value = true;
  try { voucherDetail.value = await api.get(`/vouchers/${id}`); }
  finally { voucherDetailLoading.value = false; }
}
async function showBankTransactionDetail() {
  const id = Number(active.value?.bankTransaction?.id);
  if (!id) return;
  bankTransactionDetailVisible.value = true;
  bankTransactionDetailLoading.value = true;
  try { bankTransactionDetail.value = await api.get(`/bank-transactions/${id}`); }
  finally { bankTransactionDetailLoading.value = false; }
}
async function uploadDetailAttachment(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!active.value || !files.length) return;
  const category = Number(active.value.evidenceType) === EVIDENCE_TYPE.NO_INVOICE ? "NO_INVOICE_PROOF" : "OTHER_EVIDENCE";
  const query = new URLSearchParams({ sourceType: "Reimbursement", sourceId: String(active.value.id), relationType: "RECEIPT", category });
  for (const file of files) await api.upload(`/attachments/upload?${query}`, file);
  await loadAttachments(active.value.id);
}
async function reject(row: any) {
  const result = await ElMessageBox.prompt("请输入驳回原因，可留空", "驳回报销", { inputType: "textarea" });
  await transition(row, "reject", "报销单已驳回", { reason: result.value });
}
async function cancelPayment(row: any) {
  const result = await ElMessageBox.prompt("请输入撤销付款原因", "撤销报销付款", { inputType: "textarea", inputValidator: value => Boolean(value.trim()) || "撤销原因不能为空" });
  await transition(row, "cancel-payment", "报销付款已撤销", { reason: result.value });
}
async function openPay(row: any) { active.value = row; Object.assign(payForm, { paymentDate: todayBusinessDate(), expenseAccountId: "", inputTaxAccountId: "", paymentAccountId: "", bankTransactionId: "", remark: "" }); availableBankTransactions.value = await api.get<any[]>(`/reimbursements/${row.id}/available-bank-transactions`); payVisible.value = true; }
async function pay() {
  if (!payForm.paymentDate) return ElMessage.warning("请选择付款日期");
  if (!payForm.expenseAccountId) return ElMessage.warning("请选择费用或资产科目");
  if (!payForm.paymentAccountId) return ElMessage.warning("请选择付款科目");
  if (activeDeductibleTaxTotal.value > 0 && !payForm.inputTaxAccountId) return ElMessage.warning("请选择进项税额科目");
  const { inputTaxAccountId, bankTransactionId, ...base } = payForm;
  await api.post(`/reimbursements/${active.value.id}/pay`, {
    ...base,
    ...(inputTaxAccountId ? { inputTaxAccountId } : {}),
    ...(bankTransactionId ? { bankTransactionId } : {}),
  });
  payVisible.value = false;
  ElMessage.success("报销已付款，凭证已生成");
  await load();
}

onMounted(async () => { await Promise.all([support(), load()]); });
onBeforeUnmount(closeAttachmentPreview);
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div><h2>费用报销</h2><p>个人垫付款的申请、审批、付款与入账。</p></div>
      <div class="toolbar">
        <el-select v-model="filters.status" clearable placeholder="全部状态" style="width:130px" @change="load(true)"><el-option v-for="(label,key) in labels" :key="key" :label="label" :value="key"/></el-select>
        <el-input v-model="filters.keyword" clearable placeholder="报销人/单号/发票号/说明" style="width:230px" @keyup.enter="load(true)"/>
        <el-date-picker v-model="filters.dateFrom" value-format="YYYY-MM-DD" type="date" placeholder="开始日期" style="width:140px"/>
        <el-date-picker v-model="filters.dateTo" value-format="YYYY-MM-DD" type="date" placeholder="结束日期" style="width:140px"/>
        <el-button @click="load(true)">查询</el-button>
        <el-button type="primary" @click="openCreate">新增报销</el-button>
      </div>
    </section>

    <section class="summary-grid">
      <el-card shadow="never"><div class="metric-label">报销单数</div><strong>{{ summary.count ?? 0 }}</strong></el-card>
      <el-card shadow="never"><div class="metric-label">报销金额</div><strong>{{ money(summary.amount) }}</strong></el-card>
      <el-card shadow="never"><div class="metric-label">待审批</div><strong>{{ summary.status1 ?? 0 }}</strong></el-card>
      <el-card shadow="never"><div class="metric-label">已付款</div><strong>{{ summary.status4 ?? 0 }}</strong></el-card>
    </section>

    <el-card shadow="never">
      <el-table table-layout="auto" v-loading="loading" :data="rows" stripe @row-dblclick="showDetail">
        <el-table-column prop="reimbursementNo" label="报销单号"/>
        <el-table-column prop="applicantName" label="报销人"/>
        <el-table-column prop="department" label="部门"/>
        <el-table-column prop="expenseDate" label="费用日期"><template #default="{row}">{{ date(row.expenseDate) }}</template></el-table-column>
        <el-table-column prop="expenseType" label="费用类型"/>
        <el-table-column label="报销凭据"><template #default="{row}">{{ evidenceText(row) }}</template></el-table-column>
        <el-table-column prop="amount" label="报销金额" align="right"><template #default="{row}">{{ money(row.amount) }}</template></el-table-column>
        <el-table-column label="状态"><template #default="{row}"><el-tag :type="colors[row.status as Status]">{{ labels[row.status as Status] }}</el-tag></template></el-table-column>
        <el-table-column label="凭证号"><template #default="{row}">{{ row.voucher?.voucherNo ?? "-" }}</template></el-table-column>
        <el-table-column label="操作"><template #default="{row}">
          <el-button link type="primary" @click="showDetail(row)">查看</el-button>
          <el-button v-if="row.status!==STATUS.PAID" link @click="openEdit(row)">编辑</el-button>
          <el-button v-if="[STATUS.DRAFT,STATUS.REJECTED].includes(row.status)" link type="primary" @click="transition(row,'submit','报销单已提交')">提交</el-button>
          <template v-if="isAdmin">
            <el-button v-if="row.status===STATUS.PENDING" link type="success" @click="transition(row,'approve','报销单已通过')">通过</el-button>
            <el-button v-if="row.status===STATUS.PENDING" link type="danger" @click="reject(row)">驳回</el-button>
          </template>
          <template v-if="canPay">
            <el-button v-if="row.status===STATUS.APPROVED" link type="primary" @click="openPay(row)">付款</el-button>
            <el-button v-if="row.status===STATUS.PAID" link type="danger" @click="cancelPayment(row)">撤销付款</el-button>
          </template>
        </template></el-table-column>
      </el-table>
      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" @change="load()"/>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="formId ? '编辑报销单' : '新增报销单'" width="900px">
      <el-form label-width="92px">
        <el-form-item label="凭证类型"><el-segmented v-model="form.evidenceType" :options="evidenceOptions" @change="changeEvidenceType"/></el-form-item>
        <div class="two-column">
          <el-form-item label="报销人"><el-input v-model="form.applicantName"/></el-form-item>
          <el-form-item label="部门"><el-input v-model="form.department"/></el-form-item>
          <el-form-item label="费用日期"><el-date-picker v-model="form.expenseDate" value-format="YYYY-MM-DD" type="date"/></el-form-item>
          <el-form-item label="费用类型">
            <el-select v-model="form.expenseType" filterable placeholder="请选择费用类型" style="width:100%">
              <el-option v-for="item in expenseTypes" :key="item.id" :label="item.name" :value="item.value" :disabled="!item.enabled"/>
            </el-select>
          </el-form-item>
          <el-form-item label="报销金额"><el-input v-model="form.amount"/></el-form-item>
          <el-form-item v-if="isInvoiceEvidence" label="发票合计"><el-input :model-value="money(invoiceTotal)" disabled/></el-form-item>
        </div>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="2"/></el-form-item>
        <template v-if="isInvoiceEvidence">
          <div class="invoice-title"><b>选择已导入的进项发票</b><span>只显示未入账、未被其他报销单使用的发票</span></div>
          <el-select
            v-model="form.invoiceIds"
            multiple
            filterable
            remote
            reserve-keyword
            :remote-method="(keyword:string) => loadAvailableInvoices(keyword)"
            :loading="invoiceLoading"
            placeholder="按发票号码或销售方搜索"
            style="width:100%"
            @change="updateInvoiceTotal"
          >
            <el-option v-for="invoice in availableInvoices" :key="invoice.id" :value="invoice.id" :label="`${invoice.invoiceNumber} ${invoice.sellerName} ¥${money(invoice.totalTaxIncludedAmount)}`"/>
          </el-select>
          <el-table table-layout="auto" v-if="selectedInvoices.length" :data="selectedInvoices" size="small" stripe class="selected-invoices">
            <el-table-column prop="invoiceNumber" label="发票号码"/>
            <el-table-column prop="issueTime" label="日期"><template #default="{row}">{{ date(row.issueTime) }}</template></el-table-column>
            <el-table-column prop="sellerName" label="销售方" show-overflow-tooltip/>
            <el-table-column prop="totalAmountWithoutTax" label="不含税金额" align="right"/>
            <el-table-column prop="totalTaxAmount" label="税额" align="right"/>
            <el-table-column prop="totalTaxIncludedAmount" label="价税合计" align="right"/>
            <el-table-column label="抵扣处理">
              <template #default="{row}">
                <el-select v-model="taxTreatments[row.id].deductionStatus" size="small" @change="updateTaxStatus(row)">
                  <el-option v-for="(label,key) in taxLabels" :key="key" :label="label" :value="Number(key)"/>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="可抵扣税额">
              <template #default="{row}"><el-input v-model="taxTreatments[row.id].deductibleTaxAmount" size="small" :disabled="taxTreatments[row.id].deductionStatus!==3"/></template>
            </el-table-column>
          </el-table>
          <div v-if="selectedInvoices.length" class="tax-summary">可抵扣税额合计：{{ money(deductibleTaxTotal) }}；计入费用或资产：{{ money(Number(form.amount || 0) - deductibleTaxTotal) }}</div>
        </template>
        <template v-else>
          <el-form-item :label="form.evidenceType===EVIDENCE_TYPE.NO_INVOICE ? '无票原因' : '凭证说明'">
            <el-input v-model="form.evidenceDescription" type="textarea" :rows="3" maxlength="500" show-word-limit/>
          </el-form-item>
          <el-alert title="进项税额为 0，提交审批前至少需要一个证明附件" type="warning" :closable="false" show-icon/>
          <div class="attachment-toolbar">
            <label class="el-button"><input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" hidden @change="selectSupportingFiles"/>选择证明附件</label>
          </div>
          <el-table v-if="existingAttachments.length" table-layout="auto" :data="existingAttachments" size="small">
            <el-table-column prop="attachment.originalName" label="已上传文件"/>
            <el-table-column label="大小" width="100"><template #default="{row}">{{ fileSize(row.attachment.size) }}</template></el-table-column>
            <el-table-column label="操作" width="80"><template #default="{row}"><el-button link type="danger" @click="removeAttachment(row)">移除</el-button></template></el-table-column>
          </el-table>
          <el-table v-if="stagedFiles.length" table-layout="auto" :data="stagedFiles" size="small">
            <el-table-column prop="name" label="待上传文件"/>
            <el-table-column label="大小" width="100"><template #default="{row}">{{ fileSize(row.size) }}</template></el-table-column>
            <el-table-column label="操作" width="80"><template #default="{$index}"><el-button link type="danger" @click="removeStagedFile($index)">移除</el-button></template></el-table-column>
          </el-table>
        </template>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="payVisible" title="报销付款" width="560px">
      <el-form label-width="110px">
        <el-form-item label="付款日期"><el-date-picker v-model="payForm.paymentDate" value-format="YYYY-MM-DD" type="date"/></el-form-item>
        <el-form-item label="费用或资产科目"><el-select v-model="payForm.expenseAccountId" filterable style="width:100%"><el-option v-for="row in postableAccounts" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/></el-select></el-form-item>
        <el-form-item v-if="activeDeductibleTaxTotal>0" label="进项税科目"><el-select v-model="payForm.inputTaxAccountId" filterable style="width:100%"><el-option v-for="row in inputTaxAccounts" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/></el-select></el-form-item>
        <el-form-item label="付款科目"><el-select v-model="payForm.paymentAccountId" filterable style="width:100%"><el-option v-for="row in postableAccounts" :key="row.id" :label="`${row.code} ${row.name}`" :value="row.id"/></el-select></el-form-item>
        <el-form-item label="银行流水"><el-select v-model="payForm.bankTransactionId" clearable filterable placeholder="可选：选择实际付款流水" no-data-text="没有未使用且金额相同的银行流水" style="width:100%"><el-option v-for="row in availableBankTransactions" :key="row.id" :label="`${date(row.transactionDate)} ${row.payeeName ?? row.summary ?? row.transactionNo} ¥${money(row.amount)}`" :value="row.id"/></el-select></el-form-item>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="报销金额">{{ money(active?.amount) }}</el-descriptions-item>
          <el-descriptions-item label="可抵扣税额">{{ money(activeDeductibleTaxTotal) }}</el-descriptions-item>
          <el-descriptions-item label="计入费用或资产">{{ money(Number(active?.amount ?? 0)-activeDeductibleTaxTotal) }}</el-descriptions-item>
        </el-descriptions>
        <el-form-item label="备注"><el-input v-model="payForm.remark"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="payVisible=false">取消</el-button><el-button type="primary" @click="pay">确认付款并记账</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="报销详情" size="65%">
      <template v-if="active">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="报销单号">{{ active.reimbursementNo }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag :type="colors[active.status as Status]">{{ labels[active.status as Status] }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="报销人">{{ active.applicantName }}</el-descriptions-item>
          <el-descriptions-item label="部门">{{ active.department ?? "-" }}</el-descriptions-item>
          <el-descriptions-item label="费用类型">{{ active.expenseType }}</el-descriptions-item>
          <el-descriptions-item label="报销金额">{{ money(active.amount) }}</el-descriptions-item>
          <el-descriptions-item label="凭证类型">{{ evidenceLabels[Number(active.evidenceType ?? 0) as EvidenceType] }}</el-descriptions-item>
          <el-descriptions-item label="凭证号"><el-button v-if="active.voucher?.id" link type="primary" @click="showVoucherDetail">{{ active.voucher.voucherNo }}</el-button><span v-else>-</span></el-descriptions-item>
          <el-descriptions-item label="付款流水号"><el-button v-if="active.bankTransaction?.id" link type="primary" @click="showBankTransactionDetail">{{ active.bankTransaction.transactionNo }}</el-button><span v-else>-</span></el-descriptions-item>
          <el-descriptions-item v-if="Number(active.evidenceType)!==EVIDENCE_TYPE.INVOICE" :label="Number(active.evidenceType)===EVIDENCE_TYPE.NO_INVOICE ? '无票原因' : '凭证说明'">{{ active.evidenceDescription ?? "-" }}</el-descriptions-item>
          <el-descriptions-item label="说明">{{ active.description ?? "-" }}</el-descriptions-item>
        </el-descriptions>
        <template v-if="Number(active.evidenceType ?? 0)===EVIDENCE_TYPE.INVOICE">
          <h3 class="detail-title">发票明细</h3>
          <el-table table-layout="auto" :data="allInvoiceRows(active)" stripe>
          <el-table-column prop="invoiceTitle" label="发票抬头"/>
          <el-table-column prop="invoiceTaxId" label="税号"/>
          <el-table-column prop="invoiceNumber" label="发票号码"/>
          <el-table-column prop="invoiceDate" label="发票日期"><template #default="{row}">{{ date(row.invoiceDate) }}</template></el-table-column>
          <el-table-column prop="sellerName" label="销方"/>
          <el-table-column prop="invoiceAmount" label="票面金额" align="right"><template #default="{row}">{{ money(row.invoiceAmount) }}</template></el-table-column>
          <el-table-column label="抵扣处理"><template #default="{row}">{{ taxLabels[row.taxDeductionStatus as TaxDeductionStatus] }}</template></el-table-column>
          <el-table-column prop="deductibleTaxAmount" label="可抵扣税额" align="right"/>
          </el-table>
        </template>
        <template v-else>
          <div class="detail-title attachment-heading">
            <h3>证明附件</h3>
            <label v-if="[STATUS.DRAFT,STATUS.REJECTED].includes(active.status)" class="el-button el-button--primary"><input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" hidden @change="uploadDetailAttachment"/>上传附件</label>
          </div>
          <el-table table-layout="auto" :data="existingAttachments" stripe empty-text="暂无证明附件">
            <el-table-column prop="attachment.originalName" label="文件名"/>
            <el-table-column label="大小" width="110"><template #default="{row}">{{ fileSize(row.attachment.size) }}</template></el-table-column>
            <el-table-column prop="remark" label="备注"/>
            <el-table-column label="操作" width="180">
              <template #default="{row}">
                <el-button v-if="canPreviewAttachment(row)" link type="primary" @click="previewAttachment(row)">预览</el-button>
                <el-button link type="primary" @click="downloadAttachment(row)">下载</el-button>
                <el-button v-if="[STATUS.DRAFT,STATUS.REJECTED].includes(active.status)" link type="danger" @click="removeAttachment(row)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </template>
    </el-drawer>

    <el-drawer v-model="voucherDetailVisible" title="凭证详情" size="70%" append-to-body>
      <div v-loading="voucherDetailLoading">
        <template v-if="voucherDetail">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="凭证号">{{ voucherDetail.voucherNo }}</el-descriptions-item>
            <el-descriptions-item label="凭证日期">{{ formatBusinessDate(voucherDetail.voucherDate) }}</el-descriptions-item>
            <el-descriptions-item label="入账日期">{{ formatBusinessDate(voucherDetail.postingDate) }}</el-descriptions-item>
            <el-descriptions-item label="归属期">{{ voucherDetail.period?.periodCode ?? `${voucherDetail.fiscalYear}-${String(voucherDetail.fiscalPeriod).padStart(2, '0')}` }}</el-descriptions-item>
            <el-descriptions-item label="类别">{{ voucherCategoryLabels[voucherDetail.category as VoucherCategory] ?? voucherCategoryLabels.OTHER }}</el-descriptions-item>
            <el-descriptions-item label="状态"><el-tag :type="voucherStatusColors[voucherDetail.status as VoucherStatus]">{{ voucherStatusLabels[voucherDetail.status as VoucherStatus] }}</el-tag></el-descriptions-item>
            <el-descriptions-item label="金额">{{ money(voucherDetail.totalDebit) }}</el-descriptions-item>
            <el-descriptions-item label="审核人">{{ voucherDetail.reviewer?.displayName ?? "-" }}</el-descriptions-item>
            <el-descriptions-item label="审核时间">{{ formatOperationTime(voucherDetail.reviewedAt) }}</el-descriptions-item>
            <el-descriptions-item label="记账人">{{ voucherDetail.postedBy?.displayName ?? "-" }}</el-descriptions-item>
            <el-descriptions-item label="记账时间">{{ formatOperationTime(voucherDetail.postedAt) }}</el-descriptions-item>
            <el-descriptions-item label="作废原因">{{ voucherDetail.voidReason ?? "-" }}</el-descriptions-item>
            <el-descriptions-item label="摘要" :span="3">{{ voucherDetail.summary }}</el-descriptions-item>
          </el-descriptions>
          <el-table :data="voucherDetail.entries" table-layout="auto" stripe class="linked-detail-table">
            <el-table-column prop="lineNo" label="行" width="60"/>
            <el-table-column label="会计科目" min-width="210"><template #default="{row}">{{ row.account?.code }} {{ row.account?.name }}</template></el-table-column>
            <el-table-column prop="summary" label="摘要" min-width="220" show-overflow-tooltip/>
            <el-table-column prop="debitAmount" label="借方" align="right"/>
            <el-table-column prop="creditAmount" label="贷方" align="right"/>
          </el-table>
        </template>
      </div>
    </el-drawer>

    <el-drawer v-model="bankTransactionDetailVisible" title="银行流水详情" size="62%" append-to-body>
      <div v-loading="bankTransactionDetailLoading">
        <el-descriptions v-if="bankTransactionDetail" :column="2" border>
          <el-descriptions-item label="流水号">{{ bankTransactionDetail.transactionNo }}</el-descriptions-item>
          <el-descriptions-item label="交易时间">{{ formatOperationTime(bankTransactionDetail.transactionTime) }}</el-descriptions-item>
          <el-descriptions-item label="交易类型">{{ bankTransactionDetail.transactionType ?? "-" }}</el-descriptions-item>
          <el-descriptions-item label="金额">{{ money(bankTransactionDetail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="余额">{{ bankTransactionDetail.balance == null ? "-" : money(bankTransactionDetail.balance) }}</el-descriptions-item>
          <el-descriptions-item label="入账状态">{{ bankTransactionDetail.postingStatus === "VOUCHERED" ? "已入账" : "未入账" }}</el-descriptions-item>
          <el-descriptions-item label="付方名称">{{ bankTransactionDetail.payerName ?? "-" }}</el-descriptions-item>
          <el-descriptions-item label="付方账号">{{ bankTransactionDetail.payerAccount ?? "-" }}</el-descriptions-item>
          <el-descriptions-item label="付方开户行">{{ bankTransactionDetail.payerBank ?? "-" }}</el-descriptions-item>
          <el-descriptions-item label="收方名称">{{ bankTransactionDetail.payeeName ?? "-" }}</el-descriptions-item>
          <el-descriptions-item label="收方账号">{{ bankTransactionDetail.payeeAccount ?? "-" }}</el-descriptions-item>
          <el-descriptions-item label="收方开户行">{{ bankTransactionDetail.payeeBank ?? "-" }}</el-descriptions-item>
          <el-descriptions-item label="摘要" :span="2">{{ bankTransactionDetail.summary ?? "-" }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-drawer>

    <el-dialog v-model="attachmentPreviewVisible" :title="attachmentPreviewName" width="min(92vw, 1000px)" destroy-on-close @closed="closeAttachmentPreview">
      <img v-if="attachmentPreviewMime.startsWith('image/')" class="attachment-image-preview" :src="attachmentPreviewUrl" :alt="attachmentPreviewName"/>
      <iframe v-else-if="attachmentPreviewMime==='application/pdf'" class="attachment-pdf-preview" :src="attachmentPreviewUrl" :title="attachmentPreviewName"/>
    </el-dialog>
  </div>
</template>

<style scoped>
.invoice-title { display:flex; justify-content:space-between; align-items:center; margin:12px 0 8px; }
.invoice-title span { color:var(--el-text-color-secondary); font-size:12px; }
.selected-invoices { margin-top:10px; }
.tax-summary { margin-top:10px; text-align:right; color:var(--el-text-color-regular); }
.detail-title { margin:24px 0 12px; font-size:16px; }
.attachment-toolbar { margin:12px 0 8px; }
.attachment-heading { display:flex; align-items:center; justify-content:space-between; }
.attachment-heading h3 { margin:0; font-size:16px; }
.attachment-image-preview { display:block; max-width:100%; max-height:75vh; margin:0 auto; object-fit:contain; }
.attachment-pdf-preview { display:block; width:100%; height:75vh; border:0; }
.linked-detail-table { margin-top:18px; }
</style>
