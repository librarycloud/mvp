<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { UploadFile, UploadFiles, UploadInstance } from "element-plus";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { api } from "../utils/api";
import { formatBusinessDate, formatOperationTime, todayBusinessDate } from "../utils/date";
import { exportToCsv } from "../utils/export";

type Direction = "PURCHASE" | "SALE" | "UNKNOWN";
type InvoiceType = "SPECIAL" | "ORDINARY" | "UNKNOWN";
type TaxDeductionStatus = 0 | 1 | 2 | 3;
type VoucherStatus = 0 | 1 | 2 | 3;
type VoucherCategory = "RECEIPT" | "PAYMENT" | "TRANSFER" | "ACCRUAL" | "CLOSING" | "OTHER";
const directionLabels: Record<Direction, string> = { PURCHASE: "进项", SALE: "销项", UNKNOWN: "未识别" };
const directionTypes: Record<Direction, "success" | "danger" | "warning"> = { PURCHASE: "success", SALE: "danger", UNKNOWN: "warning" };
const invoiceTypeLabels: Record<InvoiceType, string> = { SPECIAL: "专票", ORDINARY: "普票", UNKNOWN: "未识别" };
const invoiceTypeTags: Record<InvoiceType, "success" | "warning" | "info"> = { SPECIAL: "success", ORDINARY: "warning", UNKNOWN: "info" };
const taxDeductionLabels: Record<TaxDeductionStatus, string> = { 0: "待确认", 1: "全额抵扣", 2: "不抵扣", 3: "部分抵扣" };
const voucherStatusLabels: Record<VoucherStatus, string> = { 0: "草稿", 1: "待审核", 2: "已记账", 3: "作废" };
const voucherStatusColors: Record<VoucherStatus, "info" | "warning" | "success" | "danger"> = { 0: "info", 1: "warning", 2: "success", 3: "danger" };
const voucherCategoryLabels: Record<VoucherCategory, string> = { RECEIPT: "收款", PAYMENT: "付款", TRANSFER: "转账", ACCRUAL: "计提", CLOSING: "结转", OTHER: "其他" };
const auth = useAuthStore();
const router = useRouter();
const isAdmin = computed(() => auth.user?.role === "ADMIN");
const canVerify = computed(() => auth.canEditAccounting);
const canVoid = computed(() => auth.canManageAccounting);
const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const uploadRef = ref<UploadInstance>();
const files = ref<File[]>([]);
const uploading = ref(false);
const postingDate = ref(todayBusinessDate());
const importErrors = ref<Array<{ fileName: string; code: string; message: string }>>([]);
const importErrorsVisible = ref(false);
const direction = ref<Direction | "">("");
const keyword = ref("");
const dateRange = ref<string[]>([]);
const accStatus = ref<"" | "UNPOSTED" | "POSTED" | "REIMBURSING">("");
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<any>();
const voucherDetailVisible = ref(false);
const voucherDetailLoading = ref(false);
const voucherDetail = ref<any>();
const linkVisible = ref(false);
const linkLoading = ref(false);
const voucherOptions = ref<any[]>([]);
const selectedVoucherId = ref<number | "">("");
const profile = ref<any>(null);
const documentVisible = ref(false);
const documentFile = ref<File | null>(null);
const documentForm = reactive({ invoiceNumber: "", issueTime: `${todayBusinessDate()}T00:00:00.000Z`, sellerName: "", sellerIdNum: "", buyerName: "", buyerIdNum: "", totalAmountWithoutTax: "", totalTaxAmount: "", totalTaxIncludedAmount: "", invoiceType: "ORDINARY", currency: "CNY" });

const date = formatBusinessDate;
function rate(value: string | null) { return value === null ? "-" : `${Number(value) * 100}%`; }
function money(value: unknown) { return Number(value ?? 0).toFixed(2); }
function linkedVoucherCount(row: any) { return Number(row._count?.voucherSources ?? row.voucherSources?.length ?? 0); }
function accountingStatus(row: any) { const count = linkedVoucherCount(row); return count ? `已关联 ${count} 张凭证` : row.voucherId ? "已入账" : row.reimbursementId ? "报销中" : "未入账"; }
function accountingStatusType(row: any) { return linkedVoucherCount(row) || row.voucherId ? "success" : row.reimbursementId ? "warning" : "info"; }
function voucherLabel(row: any) { return `${row.voucherNo} | ${date(row.voucherDate)} | ${row.summary}`; }

function syncFiles(_file: UploadFile, fileList: UploadFiles) {
  files.value = fileList.flatMap((item) => item.raw ? [item.raw] : []);
}

function selectFile(file: UploadFile, fileList: UploadFiles) {
  if (!file.name.toLowerCase().endsWith(".xml")) {
    uploadRef.value?.handleRemove(file);
    ElMessage.warning(`文件 ${file.name} 不是 XML，已忽略`);
    return;
  }
  syncFiles(file, fileList);
}

async function load(resetPage = false) {
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const query = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) });
    if (direction.value) query.set("direction", direction.value);
    if (keyword.value.trim()) query.set("keyword", keyword.value.trim());
    if (dateRange.value && dateRange.value.length === 2) {
      query.set("startTime", new Date(`${dateRange.value[0]}T00:00:00+08:00`).toISOString());
      query.set("endTime", new Date(`${dateRange.value[1]}T23:59:59.999+08:00`).toISOString());
    }
    const data = await api.get<any>(`/invoices?${query}`);
    let items = data.items;
    if (accStatus.value === "UNPOSTED") {
      items = items.filter((r: any) => !r.voucherId && !r.reimbursementId && !linkedVoucherCount(r));
    } else if (accStatus.value === "POSTED") {
      items = items.filter((r: any) => Boolean(r.voucherId || linkedVoucherCount(r)));
    } else if (accStatus.value === "REIMBURSING") {
      items = items.filter((r: any) => Boolean(r.reimbursementId));
    }
    rows.value = items;
    total.value = accStatus.value ? items.length : data.total;
  } finally { loading.value = false; }
}

function resetFilters() {
  direction.value = "";
  keyword.value = "";
  dateRange.value = [];
  accStatus.value = "";
  void load(true);
}

function exportInvoices() {
  if (!rows.value.length) {
    ElMessage.warning("当前没有可导出的发票数据");
    return;
  }
  const headers = ["开票日期", "发票号码", "发票类型", "销售方", "购买方", "不含税价", "税额", "价税合计", "方向", "入账状态"];
  const exportRows = rows.value.map((r) => [
    date(r.issueTime),
    r.invoiceNumber,
    invoiceTypeLabels[r.invoiceType as InvoiceType] ?? r.invoiceType,
    r.sellerName,
    r.buyerName,
    money(r.totalAmountWithoutTax),
    money(r.totalTaxAmount),
    money(r.totalTaxIncludedAmount),
    directionLabels[r.direction as Direction] ?? r.direction,
    accountingStatus(r),
  ]);
  exportToCsv(`发票台账_${todayBusinessDate()}`, headers, exportRows);
  ElMessage.success(`已导出发票台账 ${rows.value.length} 条数据`);
}

async function loadProfile() {
  profile.value = await api.get<any>("/company-profile");
}

function openProfileSettings() { void router.push("/company-profile"); }

async function upload() {
  if (files.value.length === 0) return;
  uploading.value = true;
  try {
    const query = postingDate.value ? `?postingDate=${encodeURIComponent(postingDate.value)}` : "";
    const result = await api.uploadMany<any>(`/invoices/import/xml${query}`, files.value);
    ElMessage.success(`导入完成：成功 ${result.successCount}，重复跳过 ${result.skippedCount}，失败 ${result.failedCount}`);
    importErrors.value = result.errors;
    importErrorsVisible.value = result.errors.length > 0;
    const hasPeriodWarning = result.results.some((item: any) => item.periodWarning);
    uploadRef.value?.clearFiles();
    files.value = [];
    await load(true);
    if (hasPeriodWarning) {
      await ElMessageBox.alert("部分发票属于已关账期间，可先反关账或在生成凭证时选择当前打开期间。", "已关账期间");
    }
  } finally {
    uploading.value = false;
  }
}
function chooseDocument(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  if (file && !/\.(ofd|pdf)$/i.test(file.name)) { ElMessage.warning("仅支持 OFD 或 PDF 电子发票原件"); return; }
  documentFile.value = file;
}
function openDocument() { documentFile.value = null; Object.assign(documentForm, { invoiceNumber: "", issueTime: `${todayBusinessDate()}T00:00:00.000Z`, sellerName: "", sellerIdNum: "", buyerName: "", buyerIdNum: "", totalAmountWithoutTax: "", totalTaxAmount: "", totalTaxIncludedAmount: "", invoiceType: "ORDINARY", currency: "CNY" }); documentVisible.value = true; }
async function importDocument() {
  if (!documentFile.value) return ElMessage.warning("请选择 OFD 或 PDF 文件");
  const query = postingDate.value ? `?postingDate=${encodeURIComponent(postingDate.value)}` : "";
  await api.uploadWithFields(`/invoices/import/document${query}`, documentFile.value, documentForm);
  documentVisible.value = false; ElMessage.success("电子发票原件已归档，待人工核验"); await load(true);
}

async function showDetail(row: any) {
  detailVisible.value = true;
  detailLoading.value = true;
  try { detail.value = await api.get(`/invoices/${row.id}`); }
  finally { detailLoading.value = false; }
}
async function searchVouchers(keyword = "") {
  linkLoading.value = true;
  try {
    const query = new URLSearchParams({ page: "1", pageSize: "50", status: "2" });
    if (keyword.trim()) query.set("keyword", keyword.trim());
    const data = await api.get<any>(`/vouchers?${query}`);
    voucherOptions.value = data.items;
  } finally { linkLoading.value = false; }
}
async function openVoucherLink() {
  selectedVoucherId.value = "";
  linkVisible.value = true;
  await searchVouchers();
}
async function linkVoucher() {
  if (!detail.value || !selectedVoucherId.value) return;
  detail.value = await api.post<any>(`/invoices/${detail.value.id}/vouchers`, { voucherId: selectedVoucherId.value });
  linkVisible.value = false;
  ElMessage.success("凭证关联成功");
  await load();
}
async function unlinkVoucher(source: any) {
  if (!detail.value) return;
  await ElMessageBox.confirm(`确认解除与凭证 ${source.voucher.voucherNo} 的关联？`, "解除凭证关联");
  detail.value = await api.delete<any>(`/invoices/${detail.value.id}/vouchers/${source.voucherId}`);
  ElMessage.success("凭证关联已解除");
  await load();
}
async function openVoucher(voucherId: number) {
  voucherDetailVisible.value = true;
  voucherDetailLoading.value = true;
  try { voucherDetail.value = await api.get(`/vouchers/${voucherId}`); }
  finally { voucherDetailLoading.value = false; }
}
async function confirmDeduction(status: 1 | 2 | 3) {
  if (!detail.value || detail.value.direction !== "PURCHASE") return;
  let amount = status === 1 ? String(detail.value.totalTaxAmount) : "0";
  if (status === 3) {
    const result = await ElMessageBox.prompt("请输入实际可抵扣税额", "部分抵扣", { inputValue: String(detail.value.deductibleTaxAmount ?? "0"), inputValidator: (value) => /^\\d{1,15}(?:\\.\\d{1,4})?$/.test(value) || "金额格式无效" });
    amount = result.value;
  }
  await api.put(`/invoices/${detail.value.id}/tax-deduction`, { status, deductibleTaxAmount: amount });
  detail.value = await api.get(`/invoices/${detail.value.id}`); await load(); ElMessage.success("抵扣处理已保存");
}
async function verifyInvoice() { if (!detail.value) return; detail.value = await api.post(`/invoices/${detail.value.id}/verify`); await load(); ElMessage.success("人工核验结果已记录"); }
async function voidInvoice() { if (!detail.value) return; await ElMessageBox.confirm("作废后发票不能再用于报销或入账，确认继续？", "作废发票"); detail.value = await api.post(`/invoices/${detail.value.id}/void`); await load(); ElMessage.success("发票已作废"); }
async function linkRedLetter() { if (!detail.value) return; const result = await ElMessageBox.prompt("输入已导入红字发票的编号", "关联红字发票", { inputPattern: /^\d+$/, inputErrorMessage: "请输入发票记录编号" }); await api.post(`/invoices/${detail.value.id}/red-letter`, { redInvoiceId: Number(result.value) }); detail.value = await api.get(`/invoices/${detail.value.id}`); ElMessage.success("红字发票已关联"); }

const generateVoucherVisible = ref(false);
const generateLoading = ref(false);
const targetInvoice = ref<any>(null);
const allAccounts = ref<any[]>([]);
const generateForm = ref({
  expenseOrRevenueAccountId: "" as number | "",
  settlementAccountId: "" as number | "",
  summary: "",
});

async function ensureAccounts() {
  if (!allAccounts.value.length) {
    allAccounts.value = await api.get<any[]>("/accounts?isEnabled=true").catch(() => []);
  }
}

async function openGenerateVoucher(inv: any) {
  targetInvoice.value = inv;
  await ensureAccounts();
  const isPurchase = inv.direction === "PURCHASE" || (!inv.direction && inv.buyerName);
  generateForm.value = {
    expenseOrRevenueAccountId: "",
    settlementAccountId: "",
    summary: `${isPurchase ? "采购发票" : "销售发票"}-${inv.invoiceNumber}-${inv.sellerName || inv.buyerName}`,
  };
  generateVoucherVisible.value = true;
}

async function executeGenerateVoucher() {
  if (!targetInvoice.value) return;
  generateLoading.value = true;
  try {
    const res = await api.post<any>(`/invoices/${targetInvoice.value.id}/generate-voucher`, {
      expenseOrRevenueAccountId: generateForm.value.expenseOrRevenueAccountId || undefined,
      settlementAccountId: generateForm.value.settlementAccountId || undefined,
      summary: generateForm.value.summary || undefined,
    });
    ElMessage.success(`记账凭证【${res.voucherNo}】已自动生成并入账！`);
    generateVoucherVisible.value = false;
    await load();
    if (detailVisible.value && detail.value?.id === targetInvoice.value.id) {
      detail.value = await api.get(`/invoices/${targetInvoice.value.id}`);
    }
  } catch (err: any) {
    ElMessage.error(err?.message || "生成记账凭证失败");
  } finally {
    generateLoading.value = false;
  }
}

onMounted(async () => { await Promise.all([load(), loadProfile()]); });
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div><h2>电子发票</h2><p>XML 发票直接解析，支持多商品明细。</p></div>
      <div class="toolbar">
        <el-button @click="exportInvoices">导出 Excel</el-button>
        <el-button @click="openDocument">归档 OFD/PDF</el-button>
        <el-date-picker
          v-model="postingDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="入账日期（默认开票日）"
          clearable
          style="width: 190px"
        />
        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          accept=".xml,application/xml,text/xml"
          multiple
          :limit="10"
          :on-change="selectFile"
          :on-remove="syncFiles"
          :on-exceed="() => ElMessage.warning('每次最多选择 10 个 XML 文件')"
        >
          <el-button>选择 XML</el-button>
          <template #tip><div class="el-upload__tip">已选择 {{ files.length }}/10 个文件</div></template>
        </el-upload>
        <el-button type="primary" :loading="uploading" :disabled="files.length === 0" @click="upload">批量导入</el-button>
      </div>
    </section>

    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-input
          v-model="keyword"
          clearable
          placeholder="发票号码、对方名称或税号"
          style="width: 230px"
          @keyup.enter="load(true)"
        />
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开票起始"
          end-placeholder="开票截止"
          style="width: 240px"
          @change="load(true)"
        />
        <el-select v-model="direction" clearable placeholder="全部方向" style="width: 120px" @change="load(true)">
          <el-option label="进项" value="PURCHASE"/><el-option label="销项" value="SALE"/><el-option label="未识别" value="UNKNOWN"/>
        </el-select>
        <el-select v-model="accStatus" clearable placeholder="全部入账状态" style="width: 135px" @change="load(true)">
          <el-option label="未入账" value="UNPOSTED"/>
          <el-option label="已入账" value="POSTED"/>
          <el-option label="报销中" value="REIMBURSING"/>
        </el-select>
        <el-button type="primary" @click="load(true)">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-alert v-if="!profile" type="warning" :closable="false" show-icon>
      <template #title>尚未配置本企业统一社会信用代码，发票方向将显示为“未识别”。<el-button v-if="isAdmin" link type="primary" @click="openProfileSettings">前往设置</el-button></template>
    </el-alert>

    <el-card shadow="never">
      <el-table table-layout="auto" v-loading="loading" :data="rows" stripe @row-dblclick="showDetail">
        <el-table-column prop="issueTime" label="开票日期"><template #default="{row}">{{ date(row.issueTime) }}</template></el-table-column>
        <el-table-column prop="invoiceNumber" label="发票号码"/>
        <el-table-column label="发票类型"><template #default="{row}"><el-tag :type="invoiceTypeTags[row.invoiceType as InvoiceType]">{{ invoiceTypeLabels[row.invoiceType as InvoiceType] ?? invoiceTypeLabels.UNKNOWN }}</el-tag></template></el-table-column>
        <el-table-column prop="sellerName" label="销售方" show-overflow-tooltip/>
        <el-table-column prop="buyerName" label="购买方" show-overflow-tooltip/>
        <el-table-column prop="totalAmountWithoutTax" label="不含税价" align="right"/>
        <el-table-column prop="totalTaxIncludedAmount" label="价税合计" align="right"/>
        <el-table-column label="方向"><template #default="{row}"><el-tag :type="directionTypes[row.direction as Direction]">{{ directionLabels[row.direction as Direction] }}</el-tag></template></el-table-column>
        <el-table-column label="入账状态"><template #default="{row}"><el-tag :type="accountingStatusType(row)">{{ accountingStatus(row) }}</el-tag></template></el-table-column>
        <el-table-column label="抵扣处理"><template #default="{row}">{{ row.direction === 'PURCHASE' ? taxDeductionLabels[row.taxDeductionStatus as TaxDeductionStatus] : '-' }}</template></el-table-column>
        <el-table-column label="操作" width="160" align="center">
          <template #default="{row}">
            <el-button link type="primary" size="small" @click="showDetail(row)">详情</el-button>
            <el-button v-if="!row.voucherId && !row.reimbursementId" link type="success" size="small" @click="openGenerateVoucher(row)">生单</el-button>
            <el-button v-else-if="row.voucherId" link type="info" size="small" @click="openVoucher(row.voucherId)">查看凭证</el-button>
          </template>
        </el-table-column>
      </el-table>
      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" @change="load()"/>
    </el-card>

    <el-dialog v-model="documentVisible" title="归档 OFD/PDF 电子发票" width="640px">
      <el-alert type="info" :closable="false">系统不会对图片执行识别或 OCR；请根据电子发票原件确认下列字段。</el-alert>
      <el-form label-width="110px" class="document-form"><el-form-item label="电子发票原件" required><input type="file" accept=".ofd,.pdf,application/pdf" @change="chooseDocument"/><span v-if="documentFile">{{documentFile.name}}</span></el-form-item><el-form-item label="发票号码" required><el-input v-model="documentForm.invoiceNumber"/></el-form-item><el-form-item label="开票时间" required><el-date-picker v-model="documentForm.issueTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]" style="width:100%"/></el-form-item><el-form-item label="销售方名称" required><el-input v-model="documentForm.sellerName"/></el-form-item><el-form-item label="销售方税号" required><el-input v-model="documentForm.sellerIdNum"/></el-form-item><el-form-item label="购买方名称" required><el-input v-model="documentForm.buyerName"/></el-form-item><el-form-item label="购买方税号" required><el-input v-model="documentForm.buyerIdNum"/></el-form-item><el-form-item label="发票类型"><el-select v-model="documentForm.invoiceType" style="width:100%"><el-option label="专票" value="SPECIAL"/><el-option label="普票" value="ORDINARY"/></el-select></el-form-item><el-form-item label="不含税金额" required><el-input v-model="documentForm.totalAmountWithoutTax"/></el-form-item><el-form-item label="税额" required><el-input v-model="documentForm.totalTaxAmount"/></el-form-item><el-form-item label="价税合计" required><el-input v-model="documentForm.totalTaxIncludedAmount"/></el-form-item></el-form>
      <template #footer><el-button @click="documentVisible=false">取消</el-button><el-button type="primary" @click="importDocument">归档并录入</el-button></template>
    </el-dialog>

    <el-dialog v-model="importErrorsVisible" title="未导入的文件" width="640px">
      <el-table table-layout="auto" :data="importErrors" stripe>
        <el-table-column prop="fileName" label="文件名" show-overflow-tooltip/>
        <el-table-column prop="message" label="失败原因" show-overflow-tooltip/>
      </el-table>
      <template #footer><el-button type="primary" @click="importErrorsVisible=false">知道了</el-button></template>
    </el-dialog>

    <!-- 发票智能生成凭证对话框 -->
    <el-dialog v-model="generateVoucherVisible" title="发票智能生成记账凭证" width="560px" destroy-on-close>
      <el-form label-width="120px" v-if="targetInvoice">
        <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
          系统将自动生成包含价款、税额（销项税或进项税）与结算往来科目的标准双边借贷记账凭证。
        </el-alert>
        <el-form-item label="发票号码">
          <el-input :model-value="targetInvoice.invoiceNumber" disabled />
        </el-form-item>
        <el-form-item label="价税合计">
          <el-input :model-value="`¥${targetInvoice.totalTaxIncludedAmount} (税额: ¥${targetInvoice.totalTaxAmount})`" disabled />
        </el-form-item>
        <el-form-item label="凭证主摘要">
          <el-input v-model="generateForm.summary" placeholder="凭证摘要" />
        </el-form-item>
        <el-form-item :label="targetInvoice.direction === 'PURCHASE' ? '费用/存货科目' : '营业收入科目'">
          <el-select v-model="generateForm.expenseOrRevenueAccountId" filterable clearable placeholder="默认自动匹配 (6602/6001/1405)" style="width: 100%;">
            <el-option v-for="a in allAccounts.filter(acc => acc.isLeaf)" :key="a.id" :label="`${a.code} ${a.name}`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="targetInvoice.direction === 'PURCHASE' ? '应付/结算科目' : '应收/结算科目'">
          <el-select v-model="generateForm.settlementAccountId" filterable clearable placeholder="默认自动匹配 (2202/1122/1002)" style="width: 100%;">
            <el-option v-for="a in allAccounts.filter(acc => acc.isLeaf)" :key="a.id" :label="`${a.code} ${a.name}`" :value="a.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="generateVoucherVisible = false">取消</el-button>
        <el-button type="primary" :loading="generateLoading" @click="executeGenerateVoucher">立即生成凭证并入账</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="发票详情" size="72%">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="发票号码">{{ detail.invoiceNumber }}</el-descriptions-item>
            <el-descriptions-item label="发票类型"><el-tag :type="invoiceTypeTags[detail.invoiceType as InvoiceType]">{{ invoiceTypeLabels[detail.invoiceType as InvoiceType] ?? invoiceTypeLabels.UNKNOWN }}</el-tag></el-descriptions-item>
            <el-descriptions-item label="方向"><el-tag :type="directionTypes[detail.direction as Direction]">{{ directionLabels[detail.direction as Direction] }}</el-tag></el-descriptions-item>
            <el-descriptions-item label="销售方">{{ detail.sellerName }}<br>{{ detail.sellerIdNum }}</el-descriptions-item>
            <el-descriptions-item label="购买方">{{ detail.buyerName }}<br>{{ detail.buyerIdNum }}</el-descriptions-item>
            <el-descriptions-item label="不含税金额">{{ detail.totalAmountWithoutTax }}</el-descriptions-item>
            <el-descriptions-item label="税额">{{ detail.totalTaxAmount }}</el-descriptions-item>
            <el-descriptions-item label="价税合计">{{ detail.totalTaxIncludedAmount }} {{ detail.currency }}</el-descriptions-item>
            <el-descriptions-item label="抵扣处理">{{ detail.direction === 'PURCHASE' ? taxDeductionLabels[detail.taxDeductionStatus as TaxDeductionStatus] : '-' }}</el-descriptions-item>
            <el-descriptions-item label="可抵扣税额">{{ detail.deductibleTaxAmount }}</el-descriptions-item>
            <el-descriptions-item label="人工核验">{{ detail.verificationStatus === 'VERIFIED' ? '已确认' : detail.verificationStatus === 'FAILED' ? '核验失败' : '待确认' }}</el-descriptions-item>
            <el-descriptions-item label="红冲原票">{{ detail.redInvoiceOfId ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="源文件">{{ detail.importBatch?.originalName }}</el-descriptions-item>
          </el-descriptions>
          <div class="tax-actions"><el-button v-if="canVerify && detail.status !== 1 && detail.status !== 2" size="small" type="primary" @click="verifyInvoice">确认人工核验</el-button><el-button v-if="isAdmin && detail.status !== 2" size="small" @click="linkRedLetter">关联红字发票</el-button><el-button v-if="canVoid && detail.status !== 2 && !detail.reimbursementId && !detail.voucherId" size="small" type="danger" @click="voidInvoice">作废发票</el-button></div>
          <div v-if="detail.direction === 'PURCHASE'" class="tax-actions"><span>抵扣确认：</span><el-button size="small" @click="confirmDeduction(1)">全额抵扣</el-button><el-button size="small" @click="confirmDeduction(2)">不抵扣</el-button><el-button size="small" @click="confirmDeduction(3)">部分抵扣</el-button></div>
          <div class="source-heading">
            <h3 class="detail-title">关联凭证</h3>
            <div style="display: flex; gap: 8px;">
              <el-button v-if="!detail.voucherId && !detail.reimbursementId" type="success" size="small" @click="openGenerateVoucher(detail)">一键生成记账凭证</el-button>
              <el-button v-if="isAdmin && !detail.reimbursementId && detail.status !== 2" type="primary" size="small" @click="openVoucherLink">关联已有凭证</el-button>
            </div>
          </div>
          <el-empty v-if="!detail.voucherSources?.length && !detail.voucherId" description="尚未关联凭证" :image-size="60"/>
          <el-table v-else-if="detail.voucherSources?.length" table-layout="auto" :data="detail.voucherSources" size="small" stripe>
            <el-table-column label="凭证号"><template #default="{row}"><el-button link type="primary" @click="openVoucher(row.voucherId)">{{ row.voucher.voucherNo }}</el-button></template></el-table-column>
            <el-table-column label="凭证日期"><template #default="{row}">{{ date(row.voucher.voucherDate) }}</template></el-table-column>
            <el-table-column prop="voucher.summary" label="摘要" show-overflow-tooltip/>
            <el-table-column prop="voucher.totalDebit" label="金额" align="right"/>
            <el-table-column v-if="isAdmin && !detail.reimbursementId" label="操作" width="90"><template #default="{row}"><el-button link type="danger" @click="unlinkVoucher(row)">解除</el-button></template></el-table-column>
          </el-table>
          <h3 class="detail-title">商品明细</h3>
          <el-table table-layout="auto" :data="detail.items" stripe>
            <el-table-column prop="lineNo" label="行"/>
            <el-table-column prop="itemName" label="商品或服务名称"/>
            <el-table-column prop="specification" label="规格型号"/>
            <el-table-column prop="unit" label="单位"/>
            <el-table-column prop="quantity" label="数量" align="right"/>
            <el-table-column prop="unitPrice" label="单价" align="right"/>
            <el-table-column prop="amount" label="金额" align="right"/>
            <el-table-column label="税率" align="right"><template #default="{row}">{{ rate(row.taxRate) }}</template></el-table-column>
            <el-table-column prop="taxAmount" label="税额" align="right"/>
            <el-table-column prop="taxClassificationCode" label="税收分类编码"/>
          </el-table>
        </template>
      </div>
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
          <el-table :data="voucherDetail.entries" table-layout="auto" stripe class="voucher-detail-entries">
            <el-table-column prop="lineNo" label="行" width="60"/>
            <el-table-column label="会计科目" min-width="210"><template #default="{row}">{{ row.account?.code }} {{ row.account?.name }}</template></el-table-column>
            <el-table-column prop="summary" label="摘要" min-width="220" show-overflow-tooltip/>
            <el-table-column prop="debitAmount" label="借方" align="right"/>
            <el-table-column prop="creditAmount" label="贷方" align="right"/>
          </el-table>
        </template>
      </div>
    </el-drawer>
    <el-dialog v-model="linkVisible" title="关联已有记账凭证" width="620px">
      <el-form label-width="90px">
        <el-form-item label="记账凭证">
          <el-select v-model="selectedVoucherId" filterable remote :remote-method="searchVouchers" :loading="linkLoading" placeholder="搜索凭证号或摘要" style="width:100%">
            <el-option v-for="voucher in voucherOptions" :key="voucher.id" :label="voucherLabel(voucher)" :value="voucher.id"/>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="linkVisible=false">取消</el-button><el-button type="primary" :disabled="!selectedVoucherId" @click="linkVoucher">确认关联</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-card { margin-bottom: 16px; }
.filter-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 0; }
.detail-title { margin: 24px 0 12px; font-size: 16px; }
.source-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 24px; }
.source-heading .detail-title { margin: 0 0 12px; }
.voucher-detail-entries { margin-top: 18px; }
.document-form { margin-top: 16px; }
</style>
