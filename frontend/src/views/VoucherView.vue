<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch, nextTick } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { api } from "../utils/api";
import { formatBusinessDate, formatOperationTime, todayBusinessDate } from "../utils/date";
import { numberToChineseAmount } from "../utils/chinese-amount";
import { matchPinyin, getPinyinInitials } from "../utils/pinyin";
import VoucherPrintModal from "../components/VoucherPrintModal.vue";

const VOUCHER_STATUS = { DRAFT: 0, PENDING: 1, POSTED: 2, VOID: 3 } as const;
const PERIOD_STATUS = { OPEN: 0, CLOSED: 1, LOCKED: 2 } as const;
type Status = (typeof VOUCHER_STATUS)[keyof typeof VOUCHER_STATUS];
type VoucherCategory = "RECEIPT" | "PAYMENT" | "TRANSFER" | "ACCRUAL" | "CLOSING" | "OTHER";
interface AccountOption {
  id: number;
  code: string;
  name: string;
  isLeaf: boolean;
  isEnabled: boolean;
  pinyinInitials?: string;
}

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const rows = ref<any[]>([]);
const selectedRows = ref<any[]>([]);
const accounts = ref<AccountOption[]>([]);
const dimensions = ref<any[]>([]);
const loading = ref(false);
const accountsLoading = ref(false);
const visible = ref(false);
const detailVisible = ref(false);
const printVisible = ref(false);
const detail = ref<any>();
const printTarget = ref<any>();
const editingId = ref<number | "">("");
const status = ref<Status | "">("");
const category = ref<VoucherCategory | "">("");
const categoryManuallySelected = ref(false);
const currentPeriodLocked = ref(false);
const accountFilterQuery = ref("");

const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const isAdmin = computed(() => auth.canManageAccounting);

const postableAccounts = computed(() => {
  const list = accounts.value.filter((account) => account.isLeaf && account.isEnabled);
  if (!accountFilterQuery.value.trim()) return list;
  return list.filter((account) =>
    matchPinyin(`${account.code} ${account.name}`, accountFilterQuery.value)
  );
});

const form = reactive({
  voucherDate: todayBusinessDate(),
  postingDate: todayBusinessDate(),
  summary: "",
  category: "TRANSFER" as VoucherCategory,
  entries: [
    { accountId: "" as number | "", summary: "", debitAmount: "0", creditAmount: "0", dimensionMemberIds: [] as number[] },
    { accountId: "" as number | "", summary: "", debitAmount: "0", creditAmount: "0", dimensionMemberIds: [] as number[] },
  ],
});

// 计算借方合计、贷方合计、差额与大写金额
const totalDebit = computed(() => {
  const sum = form.entries.reduce((acc, e) => acc + (Number(e.debitAmount) || 0), 0);
  return Math.round(sum * 100) / 100;
});

const totalCredit = computed(() => {
  const sum = form.entries.reduce((acc, e) => acc + (Number(e.creditAmount) || 0), 0);
  return Math.round(sum * 100) / 100;
});

const balanceDiff = computed(() => {
  return Math.round((totalDebit.value - totalCredit.value) * 100) / 100;
});

const isBalanced = computed(() => {
  return Math.abs(balanceDiff.value) < 0.0001 && totalDebit.value !== 0;
});

const chineseAmount = computed(() => {
  return numberToChineseAmount(totalDebit.value);
});

const labels: Record<Status, string> = { 0: "草稿", 1: "待审核", 2: "已记账", 3: "作废" };
const colors: Record<Status, "info" | "warning" | "success" | "danger"> = { 0: "info", 1: "warning", 2: "success", 3: "danger" };
const categoryLabels: Record<VoucherCategory, string> = { RECEIPT: "收款", PAYMENT: "付款", TRANSFER: "转账", ACCRUAL: "计提", CLOSING: "结转", OTHER: "其他" };
const categoryColors: Record<VoucherCategory, "info" | "warning" | "success" | "danger"> = { RECEIPT: "success", PAYMENT: "danger", TRANSFER: "warning", ACCRUAL: "info", CLOSING: "info", OTHER: "info" };

function money(value: unknown) {
  const num = Number(value ?? 0);
  return num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function load(resetPage = false) {
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const query = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) });
    if (status.value !== "") query.set("status", String(status.value));
    if (category.value !== "") query.set("category", category.value);
    const [data, periods] = await Promise.all([
      api.get<any>(`/vouchers?${query}`),
      api.get<any[]>("/accounting-periods"),
    ]);
    rows.value = data.items;
    total.value = data.total;
    selectedRows.value = [];
    const today = todayBusinessDate();
    const current = periods.find((period) => period.startDate.slice(0, 10) <= today && period.endDate.slice(0, 10) >= today);
    currentPeriodLocked.value = Boolean(current && current.status !== PERIOD_STATUS.OPEN);
  } finally {
    loading.value = false;
  }
}

async function loadAccounts() {
  accountsLoading.value = true;
  try {
    const [rawAccounts, rawDims] = await Promise.all([
      api.get<AccountOption[]>("/accounts?tree=false&isEnabled=true"),
      api.get<any[]>("/dimensions"),
    ]);
    accounts.value = rawAccounts.map((item) => ({
      ...item,
      pinyinInitials: getPinyinInitials(item.name),
    }));
    dimensions.value = rawDims;
  } finally {
    accountsLoading.value = false;
  }
}

function handleAccountFilter(query: string) {
  accountFilterQuery.value = query;
}

function addEntry() {
  const lastSummary = form.entries[form.entries.length - 1]?.summary || form.summary;
  form.entries.push({
    accountId: "",
    summary: lastSummary,
    debitAmount: "0",
    creditAmount: "0",
    dimensionMemberIds: [],
  });
}

function removeEntry(index: number) {
  if (form.entries.length <= 2) {
    ElMessage.warning("凭证分录至少保留2行");
    return;
  }
  form.entries.splice(index, 1);
}

// 自动找平（按 = 键或空格）
function autoBalance(index: number, side: "debit" | "credit", event: KeyboardEvent) {
  if (event.key === "=") {
    event.preventDefault();
    if (side === "debit") {
      const otherDebit = form.entries.reduce((sum, e, i) => i !== index ? sum + (Number(e.debitAmount) || 0) : sum, 0);
      const diff = Math.round((totalCredit.value - otherDebit) * 100) / 100;
      form.entries[index]!.debitAmount = String(diff);
      form.entries[index]!.creditAmount = "0";
    } else {
      const otherCredit = form.entries.reduce((sum, e, i) => i !== index ? sum + (Number(e.creditAmount) || 0) : sum, 0);
      const diff = Math.round((totalDebit.value - otherCredit) * 100) / 100;
      form.entries[index]!.creditAmount = String(diff);
      form.entries[index]!.debitAmount = "0";
    }
  }
}

// 贷方回车快速添加下一行
function handleCreditEnter(index: number) {
  if (index === form.entries.length - 1) {
    addEntry();
    nextTick(() => {
      // 光标切换到新的一行
    });
  }
}

function suggestedCategory(): VoucherCategory {
  const cashEntries = form.entries.filter((entry) => {
    const code = accounts.value.find((account) => account.id === entry.accountId)?.code;
    return code?.startsWith("1001") || code?.startsWith("1002");
  });
  const hasDebit = cashEntries.some((entry) => Number(entry.debitAmount) > 0);
  const hasCredit = cashEntries.some((entry) => Number(entry.creditAmount) > 0);
  if (hasDebit && !hasCredit) return "RECEIPT";
  if (hasCredit && !hasDebit) return "PAYMENT";
  return "TRANSFER";
}

function applyCategorySuggestion() {
  if (!categoryManuallySelected.value) form.category = suggestedCategory();
}

function selectCategory() {
  categoryManuallySelected.value = true;
}

watch(() => form.entries, applyCategorySuggestion, { deep: true });

function openCreate() {
  const today = todayBusinessDate();
  editingId.value = "";
  categoryManuallySelected.value = false;
  accountFilterQuery.value = "";
  Object.assign(form, {
    voucherDate: today,
    postingDate: today,
    summary: "",
    category: "TRANSFER",
    entries: [
      { accountId: "", summary: "", debitAmount: "0", creditAmount: "0", dimensionMemberIds: [] },
      { accountId: "", summary: "", debitAmount: "0", creditAmount: "0", dimensionMemberIds: [] },
    ],
  });
  visible.value = true;
}

async function openEdit(row: any) {
  const detailData = await api.get<any>(`/vouchers/${row.id}`);
  editingId.value = row.id;
  categoryManuallySelected.value = true;
  accountFilterQuery.value = "";
  Object.assign(form, {
    voucherDate: detailData.voucherDate.slice(0, 10),
    postingDate: detailData.postingDate.slice(0, 10),
    summary: detailData.summary,
    category: detailData.category ?? "OTHER",
    entries: detailData.entries.map((entry: any) => ({
      accountId: entry.accountId,
      summary: entry.summary,
      debitAmount: entry.debitAmount,
      creditAmount: entry.creditAmount,
      dimensionMemberIds: (entry.dimensions ?? []).map((item: any) => item.dimensionMemberId),
    })),
  });
  visible.value = true;
}

async function openCopy(row: any) {
  const source = await api.get<any>(`/vouchers/${row.id}`);
  const today = todayBusinessDate();
  editingId.value = "";
  categoryManuallySelected.value = true;
  accountFilterQuery.value = "";
  Object.assign(form, {
    voucherDate: today,
    postingDate: today,
    summary: source.summary,
    category: source.category ?? "OTHER",
    entries: source.entries.map((entry: any) => ({
      accountId: entry.accountId,
      summary: entry.summary,
      debitAmount: entry.debitAmount,
      creditAmount: entry.creditAmount,
      dimensionMemberIds: (entry.dimensions ?? []).map((item: any) => item.dimensionMemberId),
    })),
  });
  visible.value = true;
}

async function showDetail(rowOrId: any) {
  const id = typeof rowOrId === "number" ? rowOrId : rowOrId.id;
  detail.value = await api.get<any>(`/vouchers/${id}`);
  detailVisible.value = true;
}

function openPrint(target: any) {
  printTarget.value = target;
  printVisible.value = true;
}

async function save() {
  if (!isBalanced.value) {
    ElMessage.error(`凭证借贷不平衡！当前借贷差额为：${balanceDiff.value} 元，请找平后再保存`);
    return;
  }
  if (editingId.value) await api.put(`/vouchers/${editingId.value}`, form);
  else await api.post("/vouchers", form);
  ElMessage.success(editingId.value ? "凭证已修改" : "凭证已保存");
  visible.value = false;
  await load();
}

async function transition(row: any, action: string, message: string, body?: unknown) {
  await api.post(`/vouchers/${row.id}/${action}`, body);
  ElMessage.success(message);
  await load();
}

async function removeDraft(row: any) {
  await ElMessageBox.confirm("删除后将不再出现在凭证列表中，是否继续？", "删除草稿", { type: "warning" });
  await api.delete(`/vouchers/${row.id}`);
  ElMessage.success("草稿已删除");
  await load();
}

async function batch(action: "submit" | "review" | "post") {
  const actionLabel = action === "submit" ? "提交" : action === "review" ? "审核" : "记账";
  await ElMessageBox.confirm(`确认对选中的 ${selectedRows.value.length} 张凭证执行批量${actionLabel}？`, `批量${actionLabel}`);
  const result = await api.post<{ succeededIds: number[]; failures: Array<{ id: number; message: string }> }>(
    `/vouchers/batch/${action}`,
    { ids: selectedRows.value.map((row) => row.id) }
  );
  if (result.failures.length) {
    ElMessage.warning(`成功 ${result.succeededIds.length} 张，失败 ${result.failures.length} 张：${result.failures[0]?.message}`);
  } else {
    ElMessage.success(`已完成 ${result.succeededIds.length} 张凭证`);
  }
  selectedRows.value = [];
  await load();
}

async function voidVoucher(row: any) {
  const result = await ElMessageBox.prompt("请输入作废原因", "作废凭证", {
    inputValidator: (value) => Boolean(value.trim()) || "作废原因不能为空",
  });
  await transition(row, "void", "凭证已作废", { reason: result.value });
}

function periodLocked(row: any) {
  return row.period && row.period.status !== PERIOD_STATUS.OPEN;
}

function sourceManaged(row: any) {
  return Number(row._count?.accountingEvents ?? 0) > 0;
}

function closeDetail() {
  detailVisible.value = false;
  if (route.query.voucherId) router.replace({ path: "/vouchers", query: {} });
}

onMounted(async () => {
  await Promise.all([load(), loadAccounts()]);
  const voucherId = Number(route.query.voucherId);
  if (Number.isInteger(voucherId) && voucherId > 0) await showDetail(voucherId);
});
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div>
        <h2>会计凭证</h2>
        <p>凭证审核通过并记账后进入账簿和报表。支持负数红字冲销、键盘快捷找平与标准凭证套打。</p>
      </div>
      <div class="toolbar">
        <el-select v-model="status" clearable placeholder="全部状态" style="width:130px" @change="load(true)">
          <el-option v-for="(label, key) in labels" :key="key" :label="label" :value="key" />
        </el-select>
        <el-select v-model="category" clearable placeholder="全部类别" style="width:120px" @change="load(true)">
          <el-option v-for="(label, key) in categoryLabels" :key="key" :label="label" :value="key" />
        </el-select>
        <template v-if="selectedRows.length">
          <el-button @click="batch('submit')">批量提交</el-button>
          <el-button v-if="isAdmin" @click="batch('review')">批量审核</el-button>
          <el-button v-if="isAdmin" type="success" @click="batch('post')">批量记账</el-button>
        </template>
        <span v-if="currentPeriodLocked" class="period-closed">当前期间已关账</span>
        <el-button type="primary" :disabled="currentPeriodLocked" @click="openCreate">新增凭证</el-button>
      </div>
    </section>

    <el-card shadow="never">
      <el-table table-layout="auto" v-loading="loading" :data="rows" stripe @selection-change="selectedRows = $event">
        <el-table-column type="selection" width="48" />
        <el-table-column label="凭证号">
          <template #default="{ row }">
            <el-button link type="primary" @click="showDetail(row)">{{ row.voucherNo }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="凭证日期">
          <template #default="{ row }">{{ formatBusinessDate(row.voucherDate) }}</template>
        </el-table-column>
        <el-table-column label="入账日期">
          <template #default="{ row }">{{ formatBusinessDate(row.postingDate) }}</template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" width="240" show-overflow-tooltip />
        <el-table-column label="金额" align="right">
          <template #default="{ row }">
            <span :class="{ 'red-text': Number(row.totalDebit) < 0 }">
              {{ money(row.totalDebit) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="类别">
          <template #default="{ row }">
            <el-tag :type="categoryColors[row.category as VoucherCategory] ?? categoryColors.OTHER">
              {{ categoryLabels[row.category as VoucherCategory] ?? categoryLabels.OTHER }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态">
          <template #default="{ row }">
            <el-tag :type="colors[row.status as Status]">{{ labels[row.status as Status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="260">
          <template #default="{ row }">
            <el-button link @click="showDetail(row)">查看</el-button>
            <el-button link @click="openPrint(row)">打印</el-button>
            <el-button link @click="openCopy(row)">复制</el-button>
            <el-button v-if="row.status === VOUCHER_STATUS.DRAFT" link type="primary" :disabled="periodLocked(row)" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.status === VOUCHER_STATUS.DRAFT" link type="danger" :disabled="periodLocked(row) || sourceManaged(row)" @click="removeDraft(row)">删除</el-button>
            <el-button v-if="row.status === VOUCHER_STATUS.DRAFT" link type="primary" :disabled="periodLocked(row)" @click="transition(row, 'submit', '已提交审核')">提交审核</el-button>
            <template v-if="isAdmin">
              <el-button v-if="row.status === VOUCHER_STATUS.PENDING && !row.reviewedAt" link type="primary" :disabled="periodLocked(row)" @click="transition(row, 'review', '审核完成')">审核</el-button>
              <el-button v-if="row.status === VOUCHER_STATUS.PENDING" link :disabled="periodLocked(row)" @click="transition(row, 'unreview', '已取消审核')">取消审核</el-button>
              <el-button v-if="row.status === VOUCHER_STATUS.PENDING && row.reviewedAt" link type="success" :disabled="periodLocked(row)" @click="transition(row, 'post', '记账完成')">记账</el-button>
              <el-button v-if="row.status === VOUCHER_STATUS.POSTED && !sourceManaged(row)" link :disabled="periodLocked(row)" @click="transition(row, 'unpost', '已取消记账')">取消记账</el-button>
              <el-button v-if="row.status === VOUCHER_STATUS.POSTED && !sourceManaged(row)" link type="danger" :disabled="periodLocked(row)" @click="voidVoucher(row)">作废</el-button>
              <el-button v-if="row.status === VOUCHER_STATUS.VOID && !sourceManaged(row)" link type="primary" :disabled="periodLocked(row)" @click="transition(row, 'restore', '已恢复为草稿')">恢复</el-button>
              <el-tag v-if="sourceManaged(row)" type="info">请从来源模块撤销</el-tag>
              <span v-if="periodLocked(row)" class="period-closed">当前期间已关账</span>
            </template>
          </template>
        </el-table-column>
      </el-table>
      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" @change="load()" />
    </el-card>

    <!-- 凭证录入与编辑对话框 -->
    <el-dialog v-model="visible" :title="editingId ? '编辑凭证' : '新增手工凭证'" width="960px" destroy-on-close>
      <el-form label-width="130px">
        <div class="form-header-grid">
          <el-form-item label="凭证日期">
            <el-date-picker v-model="form.voucherDate" value-format="YYYY-MM-DD" style="width: 100%;" />
          </el-form-item>
          <el-form-item label="入账日期">
            <el-date-picker v-model="form.postingDate" value-format="YYYY-MM-DD" style="width: 100%;" />
          </el-form-item>
          <el-form-item label="凭证类别">
            <el-select v-model="form.category" @change="selectCategory" style="width: 100%;">
              <el-option v-for="(label, key) in categoryLabels" :key="key" :label="label" :value="key" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="全局摘要">
          <el-input v-model="form.summary" placeholder="填入主摘要，新分录将自动继承" />
        </el-form-item>

        <div class="shortcut-tip">
          💡 <strong>录单效率小贴士</strong>：借/贷方输入框支持按键盘 <code>=</code> 键快速找平差额；在贷方按 <code>Enter</code> 键自动换行添加分录；会计科目支持输入拼音简码（如 <code>yhck</code> 匹配银行存款）极速检索；负数可直接输入负号 <code>-</code> 制作红字冲销凭证。
        </div>

        <div class="entry-head">
          <span>会计科目 (支持拼音简码)</span>
          <span>分录摘要</span>
          <span>借方金额 (=号找平)</span>
          <span>贷方金额 (=号找平)</span>
          <span>辅助核算</span>
          <span>操作</span>
        </div>

        <div v-for="(entry, index) in form.entries" :key="index" class="entry-row">
          <el-select
            v-model="entry.accountId"
            filterable
            remote
            :remote-method="handleAccountFilter"
            @change="applyCategorySuggestion"
            :loading="accountsLoading"
            placeholder="拼音/编码/名称"
          >
            <el-option
              v-for="account in postableAccounts"
              :key="account.id"
              :label="`${account.code} ${account.name}`"
              :value="account.id"
            />
          </el-select>

          <el-input v-model="entry.summary" placeholder="摘要" />

          <el-input
            v-model="entry.debitAmount"
            placeholder="0.00"
            :class="{ 'red-input': Number(entry.debitAmount) < 0 }"
            @keydown="autoBalance(index, 'debit', $event)"
          />

          <el-input
            v-model="entry.creditAmount"
            placeholder="0.00"
            :class="{ 'red-input': Number(entry.creditAmount) < 0 }"
            @keydown="autoBalance(index, 'credit', $event)"
            @keyup.enter="handleCreditEnter(index)"
          />

          <el-select v-model="entry.dimensionMemberIds" multiple collapse-tags filterable placeholder="可选">
            <el-option-group v-for="dim in dimensions" :key="dim.id" :label="`${dim.code} ${dim.name}`">
              <el-option v-for="member in dim.members" :key="member.id" :label="member.name" :value="member.id" />
            </el-option-group>
          </el-select>

          <el-button link type="danger" @click="removeEntry(index)" :disabled="form.entries.length <= 2">
            删除
          </el-button>
        </div>

        <div class="entry-actions">
          <el-button text type="primary" @click="addEntry">+ 增加分录 (或在贷方回车)</el-button>
        </div>

        <!-- 实时借贷平衡与大写金额状态条 -->
        <div class="balance-bar">
          <div class="balance-left">
            <span class="label">合计大写：</span>
            <span class="chinese-val">{{ chineseAmount }}</span>
          </div>
          <div class="balance-right">
            <span>借方：<strong>{{ totalDebit.toFixed(2) }}</strong></span>
            <span>贷方：<strong>{{ totalCredit.toFixed(2) }}</strong></span>
            <span v-if="!isBalanced" class="diff-tag unbalanced">
              差额：{{ balanceDiff.toFixed(2) }} (借贷不平)
            </span>
            <span v-else class="diff-tag balanced">借贷平衡</span>
          </div>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="!isBalanced" @click="save">
          {{ editingId ? '保存修改' : '保存草稿' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 凭证详情抽屉 -->
    <el-drawer v-model="detailVisible" title="凭证详情" size="70%" @closed="closeDetail">
      <template v-if="detail">
        <div class="detail-toolbar" style="margin-bottom: 16px;">
          <el-button type="primary" @click="openPrint(detail)">打印标准记账凭证</el-button>
        </div>

        <el-descriptions :column="3" border>
          <el-descriptions-item label="凭证号">{{ detail.voucherNo }}</el-descriptions-item>
          <el-descriptions-item label="凭证日期">{{ formatBusinessDate(detail.voucherDate) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="colors[detail.status as Status]">{{ labels[detail.status as Status] }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="类别">
            <el-tag :type="categoryColors[detail.category as VoucherCategory] ?? categoryColors.OTHER">
              {{ categoryLabels[detail.category as VoucherCategory] ?? categoryLabels.OTHER }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="归属期">
            {{ detail.period?.periodCode ?? `${detail.fiscalYear}-${String(detail.fiscalPeriod).padStart(2, '0')}` }}
          </el-descriptions-item>
          <el-descriptions-item label="合计大写">
            {{ numberToChineseAmount(detail.totalDebit) }}
          </el-descriptions-item>
          <el-descriptions-item label="审核人">{{ detail.reviewer?.displayName ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="审核时间">{{ formatOperationTime(detail.reviewedAt) }}</el-descriptions-item>
          <el-descriptions-item label="作废原因">{{ detail.voidReason ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="记账人">{{ detail.postedBy?.displayName ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="记账时间">{{ formatOperationTime(detail.postedAt) }}</el-descriptions-item>
          <el-descriptions-item label="制单人">{{ detail.createdBy?.displayName ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="摘要" :span="3">{{ detail.summary }}</el-descriptions-item>
        </el-descriptions>

        <el-table :data="detail.entries" table-layout="auto" stripe class="detail-entries">
          <el-table-column prop="lineNo" label="行" width="55" />
          <el-table-column label="会计科目" min-width="210">
            <template #default="{ row }">{{ row.account.code }} {{ row.account.name }}</template>
          </el-table-column>
          <el-table-column prop="summary" label="摘要" width="240" show-overflow-tooltip />
          <el-table-column prop="debitAmount" label="借方金额" align="right">
            <template #default="{ row }">
              <span :class="{ 'red-text': Number(row.debitAmount) < 0 }">
                {{ Number(row.debitAmount) !== 0 ? money(row.debitAmount) : '' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="creditAmount" label="贷方金额" align="right">
            <template #default="{ row }">
              <span :class="{ 'red-text': Number(row.creditAmount) < 0 }">
                {{ Number(row.creditAmount) !== 0 ? money(row.creditAmount) : '' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="辅助核算">
            <template #default="{ row }">
              <el-tag v-for="item in row.dimensions" :key="item.id" size="small" class="inline-tag">
                {{ item.dimension?.name }}:{{ item.dimensionMember?.name }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>

    <!-- 记账凭证打印模态框 -->
    <VoucherPrintModal v-model="printVisible" :voucher="printTarget" />
  </div>
</template>

<style scoped>
.form-header-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.shortcut-tip {
  background: #f0f7ff;
  border-left: 4px solid #409eff;
  padding: 8px 12px;
  font-size: 12px;
  color: #333;
  margin-bottom: 14px;
  line-height: 1.6;
}

.shortcut-tip code {
  background: #e1ecfb;
  padding: 2px 4px;
  border-radius: 3px;
  color: #1d72d2;
  font-weight: bold;
}

.entry-head,
.entry-row {
  display: grid;
  grid-template-columns: 1.3fr 1fr 0.8fr 0.8fr 1fr 48px;
  gap: 8px;
  align-items: center;
}

.entry-head {
  font-size: 12px;
  font-weight: bold;
  color: #555;
  background: #f8f9fa;
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.entry-row {
  margin-bottom: 8px;
}

.entry-actions {
  margin-top: 8px;
}

.balance-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8f9fa;
  border: 1px solid #ebeef5;
  padding: 10px 14px;
  border-radius: 4px;
  margin-top: 14px;
  font-size: 13px;
}

.balance-left .chinese-val {
  font-weight: bold;
  color: #303133;
}

.balance-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.diff-tag {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.diff-tag.unbalanced {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fde2e2;
}

.diff-tag.balanced {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #e1f3d8;
}

.red-text {
  color: #f56c6c !important;
  font-weight: bold;
}

.red-input :deep(input) {
  color: #f56c6c !important;
  font-weight: bold;
}

.detail-entries {
  margin-top: 18px;
}
</style>
