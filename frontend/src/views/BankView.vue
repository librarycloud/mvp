<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRouter } from "vue-router";
import { api } from "../utils/api";
import { formatOperationTime, todayBusinessDate } from "../utils/date";
import { exportToCsv } from "../utils/export";

type PostingStatus = "UNPOSTED" | "VOUCHERED";
type ReconciliationStatus = "UNMATCHED" | "PARTIAL" | "MATCHED";

interface AccountOption {
  id: number;
  code: string;
  name: string;
  isLeaf: boolean;
  isEnabled: boolean;
}

const router = useRouter();
const rows = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const uploading = ref(false);
const fetching = ref(false);
const fetchDialogVisible = ref(false);
const cmbConfigSecretsConfigured = ref(false);
const file = ref<File>();
const page = ref(1);
const pageSize = ref(20);
const accounts = ref<AccountOption[]>([]);
const filters = reactive({
  keyword: "",
  dateRange: [] as string[],
  voucherStatus: "" as PostingStatus | "",
  reconciliationStatus: "" as "UNMATCHED" | "MATCHED" | "",
});
const cmbConfig = reactive({
  apiUrl: "https://cdc.cmbchina.com/cdcserver/api/v2",
  userId: "",
  cardNbr: "",
  beginDate: "",
  endDate: "",
  currencyCode: "",
  privateKey: "",
  bankPublicKey: "",
  symKey: "",
});

const quickVoucherVisible = ref(false);
const quickVoucherSaving = ref(false);
const quickVoucherForm = reactive({
  transactionId: 0,
  voucherDate: "",
  category: "PAYMENT" as "RECEIPT" | "PAYMENT",
  summary: "",
  bankAccountId: "" as number | "",
  counterAccountId: "" as number | "",
  amount: "0.00",
});

const postingLabels: Record<PostingStatus, string> = {
  UNPOSTED: "未入账",
  VOUCHERED: "已入账",
};
const reconciliationLabels: Record<ReconciliationStatus, string> = {
  UNMATCHED: "未对账",
  PARTIAL: "部分匹配",
  MATCHED: "已匹配",
};

function formatMoney(val: unknown) {
  const num = Number(val ?? 0);
  const prefix = num > 0 ? "+" : "";
  return prefix + num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBalance(val: unknown) {
  if (val === null || val === undefined || val === "") return "-";
  return Number(val).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildQuery() {
  const query = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) });
  if (filters.keyword.trim()) query.set("keyword", filters.keyword.trim());
  if (filters.voucherStatus) query.set("voucherStatus", filters.voucherStatus);
  if (filters.reconciliationStatus) query.set("reconciliationStatus", filters.reconciliationStatus);
  if (filters.dateRange.length === 2) {
    query.set("startTime", new Date(`${filters.dateRange[0]}T00:00:00+08:00`).toISOString());
    query.set("endTime", new Date(`${filters.dateRange[1]}T23:59:59.999+08:00`).toISOString());
  }
  return query.toString();
}

async function load(resetPage = false) {
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const data = await api.get<any>(`/bank-transactions?${buildQuery()}`);
    rows.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function loadAccounts() {
  try {
    const res = await api.get<AccountOption[]>("/accounts?tree=false&isEnabled=true");
    accounts.value = res.filter((a) => a.isLeaf && a.isEnabled);
  } catch { /* ignored */ }
}

function resetFilters() {
  Object.assign(filters, { keyword: "", dateRange: [], voucherStatus: "", reconciliationStatus: "" });
  load(true);
}

function viewVoucher(voucherId: number) {
  router.push({ path: "/vouchers", query: { voucherId: String(voucherId) } });
}

function openQuickVoucher(row: any) {
  const isPositive = Number(row.amount) >= 0;
  const absAmount = Math.abs(Number(row.amount)).toFixed(2);
  const defaultBank = accounts.value.find((a) => a.code.startsWith("1002") && a.isLeaf) || accounts.value.find((a) => a.code.startsWith("1001") && a.isLeaf);
  const defaultCounter = isPositive
    ? accounts.value.find((a) => a.code.startsWith("1122") || a.code.startsWith("6001"))
    : accounts.value.find((a) => a.code.startsWith("6602") || a.code.startsWith("2202"));

  quickVoucherForm.transactionId = row.id;
  quickVoucherForm.voucherDate = row.transactionTime ? row.transactionTime.slice(0, 10) : todayBusinessDate();
  quickVoucherForm.category = isPositive ? "RECEIPT" : "PAYMENT";
  quickVoucherForm.summary = row.summary || (isPositive ? `收到 ${row.payerName || "银行转入款"}` : `支付 ${row.payeeName || "银行转出款"}`);
  quickVoucherForm.bankAccountId = defaultBank?.id ?? "";
  quickVoucherForm.counterAccountId = defaultCounter?.id ?? "";
  quickVoucherForm.amount = absAmount;
  quickVoucherVisible.value = true;
}

async function submitQuickVoucher() {
  if (!quickVoucherForm.counterAccountId) {
    ElMessage.warning("请选择对方业务科目");
    return;
  }
  if (!quickVoucherForm.summary.trim()) {
    ElMessage.warning("请输入凭证摘要");
    return;
  }
  quickVoucherSaving.value = true;
  try {
    const res = await api.post<any>(`/bank-transactions/${quickVoucherForm.transactionId}/generate-voucher`, {
      counterAccountId: Number(quickVoucherForm.counterAccountId),
      summary: quickVoucherForm.summary.trim(),
    });
    ElMessage.success(`记账凭证【${res.voucherNo}】已自动生成并入账！`);
    quickVoucherVisible.value = false;
    await load();
  } catch (err: any) {
    ElMessage.error(err?.message || "认领生单失败");
  } finally {
    quickVoucherSaving.value = false;
  }
}

// 出纳日记账
const activeViewTab = ref<"transactions" | "journal">("transactions");
const journalLoading = ref(false);
const journalAccountCode = ref("1002");
const journalDateRange = ref<string[]>([
  new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  todayBusinessDate(),
]);
const journalData = ref<any>({
  accounts: [],
  openingBalance: "0.00",
  totalDebit: "0.00",
  totalCredit: "0.00",
  closingBalance: "0.00",
  entries: [],
});

async function loadCashierJournal() {
  journalLoading.value = true;
  try {
    const [start, end] = journalDateRange.value;
    const res = await api.get<any>(
      `/vouchers/cashier-journal?accountCode=${journalAccountCode.value}&startDate=${start}&endDate=${end}`
    );
    journalData.value = res;
  } catch (err: any) {
    ElMessage.error(err?.message || "获取出纳日记账失败");
  } finally {
    journalLoading.value = false;
  }
}

function exportCashierJournal() {
  if (!journalData.value.entries?.length) {
    ElMessage.warning("暂无可导出的出纳日记账数据");
    return;
  }
  const headers = ["日期", "凭证号", "会计科目", "摘要", "借方(存入)", "贷方(支取)", "方向", "结存余额", "出纳签字状态"];
  const exportRows = journalData.value.entries.map((e: any) => [
    e.date,
    e.voucherNo,
    `${e.accountCode} ${e.accountName}`,
    e.summary,
    e.debitAmount,
    e.creditAmount,
    e.direction === "DEBIT" ? "借" : e.direction === "CREDIT" ? "贷" : "平",
    e.balance,
    e.isSigned ? "已签字" : "未签字",
  ]);
  exportToCsv(`出纳日记账_${journalAccountCode.value}_${journalDateRange.value[0]}至${journalDateRange.value[1]}`, headers, exportRows);
  ElMessage.success("出纳日记账已导出");
}

function exportTransactions() {
  if (!rows.value.length) {
    ElMessage.warning("当前没有可导出的流水数据");
    return;
  }
  const headers = ["交易时间", "流水号", "付方", "收方", "摘要", "金额", "余额", "入账状态", "关联凭证", "对账状态"];
  const exportRows = rows.value.map((r) => [
    formatOperationTime(r.transactionTime),
    r.transactionNo,
    r.payerName ?? "",
    r.payeeName ?? "",
    r.summary ?? "",
    r.amount,
    r.balance ?? "",
    postingLabels[r.postingStatus as PostingStatus] ?? r.postingStatus,
    r.voucher?.voucherNo ?? "",
    reconciliationLabels[r.reconciliationStatus as ReconciliationStatus] ?? r.reconciliationStatus,
  ]);
  exportToCsv(`银行流水_${todayBusinessDate()}`, headers, exportRows);
  ElMessage.success(`已导出 ${rows.value.length} 条银行流水数据`);
}

async function upload() {
  if (!file.value) return;
  uploading.value = true;
  try {
    const result = await api.upload<any>("/bank-transactions/import", file.value);
    const summary = `导入完成：成功 ${result.successCount} 条，跳过 ${result.skippedCount} 条，失败 ${result.failedCount} 条`;
    if (result.failedCount) {
      ElMessage.warning(`${summary}${result.errors?.[0]?.message ? `；首条错误：${result.errors[0].message}` : ""}`);
    } else {
      ElMessage.success(summary);
    }
    file.value = undefined;
    await load(true);
    if (result.periodWarnings?.length) {
      await ElMessageBox.alert(
        `共有 ${result.periodWarnings.length} 条流水属于已关账期间。可反关账后记入原期间，或在生成凭证时选择当前开放期间。`,
        "已关账期间",
      );
    }
  } finally {
    uploading.value = false;
  }
}

async function fetchFromBank() {
  if (cmbConfig.privateKey && cmbConfig.bankPublicKey && cmbConfig.symKey) await saveCmbConfig(false);
  fetching.value = true;
  try {
    const payload: Record<string, string> = {
      apiUrl: cmbConfig.apiUrl,
      userId: cmbConfig.userId,
      cardNbr: cmbConfig.cardNbr,
      beginDate: cmbConfig.beginDate,
      endDate: cmbConfig.endDate,
      currencyCode: cmbConfig.currencyCode,
    };
    if (cmbConfig.privateKey) payload.privateKey = cmbConfig.privateKey;
    if (cmbConfig.bankPublicKey) payload.bankPublicKey = cmbConfig.bankPublicKey;
    if (cmbConfig.symKey) payload.symKey = cmbConfig.symKey;
    const result = await api.post<any>("/bank-transactions/fetch", payload);
    const summary = `获取完成：成功 ${result.successCount} 条，跳过 ${result.skippedCount} 条，失败 ${result.failedCount} 条`;
    result.failedCount ? ElMessage.warning(summary) : ElMessage.success(summary);
    await load(true);
    fetchDialogVisible.value = false;
    if (result.periodWarnings?.length) {
      await ElMessageBox.alert(`共有 ${result.periodWarnings.length} 条流水属于已关账期间。`, "已关账期间");
    }
  } finally {
    fetching.value = false;
  }
}

async function saveCmbConfig(showMessage = true) {
  if (!cmbConfig.privateKey || !cmbConfig.bankPublicKey || !cmbConfig.symKey) {
    ElMessage.warning("请完整填写招商银行接口密钥");
    return;
  }
  await api.put("/bank-transactions/fetch-config", {
    apiUrl: cmbConfig.apiUrl,
    userId: cmbConfig.userId,
    cardNbr: cmbConfig.cardNbr,
    beginDate: cmbConfig.beginDate,
    endDate: cmbConfig.endDate,
    currencyCode: cmbConfig.currencyCode,
    privateKey: cmbConfig.privateKey,
    bankPublicKey: cmbConfig.bankPublicKey,
    symKey: cmbConfig.symKey,
  });
  cmbConfigSecretsConfigured.value = true;
  if (showMessage) ElMessage.success("配置已保存");
}

async function restoreCmbConfig() {
  try {
    const saved = await api.get<(Pick<typeof cmbConfig, "apiUrl" | "userId" | "cardNbr" | "beginDate" | "endDate" | "currencyCode"> & { hasPrivateKey: boolean; hasBankPublicKey: boolean; hasSymKey: boolean }) | null>("/bank-transactions/fetch-config");
    if (saved) {
      Object.assign(cmbConfig, {
        apiUrl: saved.apiUrl,
        userId: saved.userId,
        cardNbr: saved.cardNbr,
        beginDate: saved.beginDate,
        endDate: saved.endDate,
        currencyCode: saved.currencyCode,
      });
      cmbConfigSecretsConfigured.value = saved.hasPrivateKey && saved.hasBankPublicKey && saved.hasSymKey;
    }
    localStorage.removeItem("finance_cmb_bank_fetch_config");
  } catch { /* The error is already presented by the API client. */ }
}

onMounted(() => {
  void restoreCmbConfig();
  void load();
  void loadAccounts();
});
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div><h2>资金与银行</h2><p>支持招商银行网银直联与表格流水导入、认领生单，以及按科目日清月结的出纳日记账。</p></div>
      <div class="toolbar">
        <el-radio-group v-model="activeViewTab" size="default" style="margin-right: 12px;" @change="(v: any) => { if (v === 'journal') loadCashierJournal(); }">
          <el-radio-button label="transactions">银行流水管理</el-radio-button>
          <el-radio-button label="journal">出纳日记账</el-radio-button>
        </el-radio-group>
        <template v-if="activeViewTab === 'transactions'">
          <el-button @click="exportTransactions">导出 Excel</el-button>
          <el-button type="primary" plain @click="fetchDialogVisible = true">招商银行接口拉取</el-button>
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept=".xlsx,.csv"
            :on-change="(selected: any) => file = selected.raw"
          ><el-button>{{ file?.name ?? "选择文件" }}</el-button></el-upload>
          <el-button type="primary" :loading="uploading" :disabled="!file" @click="upload">导入流水</el-button>
        </template>
        <template v-else>
          <el-button @click="exportCashierJournal">导出日记账</el-button>
          <el-button type="primary" :loading="journalLoading" @click="loadCashierJournal">刷新</el-button>
        </template>
      </div>
    </section>

    <el-dialog v-model="fetchDialogVisible" class="cmb-dialog" title="招商银行接口拉取" width="min(760px, calc(100% - 24px))" top="6vh">
      <div class="card-title"><div><h3>招商银行接口拉取</h3><p>填写接口配置后，系统会自动完成分页续传并导入流水。</p></div><el-tag type="success">trsQryByBreakPoint</el-tag></div>
      <el-form class="cmb-form" label-position="top">
        <el-form-item label="接口地址" required><el-input v-model="cmbConfig.apiUrl" placeholder="https://..." /></el-form-item>
        <el-form-item label="用户 ID" required><el-input v-model="cmbConfig.userId" placeholder="userid" /></el-form-item>
        <el-form-item label="户口号" required><el-input v-model="cmbConfig.cardNbr" placeholder="cardNbr" /></el-form-item>
        <el-form-item label="开始日期" required><el-date-picker v-model="cmbConfig.beginDate" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="结束日期" required><el-date-picker v-model="cmbConfig.endDate" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="币种"><el-input v-model="cmbConfig.currencyCode" maxlength="2" placeholder="可选" /></el-form-item>
        <el-form-item label="客户私钥" required><el-input v-model="cmbConfig.privateKey" type="password" show-password placeholder="Base64 私钥" /></el-form-item>
        <el-form-item label="招商银行公钥" required><el-input v-model="cmbConfig.bankPublicKey" type="password" show-password placeholder="Base64 公钥" /></el-form-item>
        <el-form-item label="对称密钥" required><el-input v-model="cmbConfig.symKey" type="password" show-password maxlength="16" placeholder="16 位密钥" /></el-form-item>
        <p class="cmb-help">密钥加密保存至当前登录账号，换设备或浏览器登录后会自动恢复。</p>
      </el-form>
      <template #footer><el-button @click="fetchDialogVisible = false">取消</el-button><el-button @click="saveCmbConfig">保存配置</el-button><el-button type="primary" :loading="fetching" :disabled="!cmbConfig.apiUrl || !cmbConfig.userId || !cmbConfig.cardNbr || !cmbConfig.beginDate || !cmbConfig.endDate || (!cmbConfigSecretsConfigured && (!cmbConfig.privateKey || !cmbConfig.bankPublicKey || !cmbConfig.symKey))" @click="fetchFromBank">一键获取流水</el-button></template>
    </el-dialog>

    <template v-if="activeViewTab === 'transactions'">
      <el-card shadow="never">
        <div class="filter-row">
          <el-input
            v-model="filters.keyword"
            clearable
            placeholder="流水号、对方名称或摘要"
            style="width: 230px"
            @keyup.enter="load(true)"
          />
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 240px"
          />
          <el-select v-model="filters.voucherStatus" clearable placeholder="全部入账状态" style="width: 140px">
            <el-option label="未入账" value="UNPOSTED"/>
            <el-option label="已入账" value="VOUCHERED"/>
          </el-select>
          <el-select v-model="filters.reconciliationStatus" clearable placeholder="全部对账状态" style="width: 140px">
            <el-option label="未对账" value="UNMATCHED"/>
            <el-option label="已有匹配" value="MATCHED"/>
          </el-select>
          <el-button type="primary" @click="load(true)">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </div>
      </el-card>

      <el-card shadow="never">
        <el-table table-layout="auto" v-loading="loading" :data="rows" stripe>
          <el-table-column label="交易时间" min-width="160"><template #default="{ row }">{{ formatOperationTime(row.transactionTime) }}</template></el-table-column>
          <el-table-column prop="transactionNo" label="流水号" min-width="170" show-overflow-tooltip/>
          <el-table-column prop="payerName" label="付方" min-width="150" show-overflow-tooltip/>
          <el-table-column prop="payeeName" label="收方" min-width="150" show-overflow-tooltip/>
          <el-table-column prop="summary" label="摘要" min-width="160" show-overflow-tooltip/>
          <el-table-column label="金额" align="right" width="130">
            <template #default="{ row }">
              <span :class="Number(row.amount) >= 0 ? 'amount-in' : 'amount-out'">
                {{ formatMoney(row.amount) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="余额" align="right" width="130">
            <template #default="{ row }">{{ formatBalance(row.balance) }}</template>
          </el-table-column>
          <el-table-column label="入账" width="130">
            <template #default="{ row }">
              <el-tag :type="row.postingStatus === 'VOUCHERED' ? 'success' : 'info'">{{ postingLabels[row.postingStatus as PostingStatus] }}</el-tag>
              <div v-if="row.voucher" class="voucher-link">
                <el-button link type="primary" size="small" @click="viewVoucher(row.voucher.id)">
                  {{ row.voucher.voucherNo }}
                </el-button>
              </div>
              <div v-else-if="row.postingStatus === 'UNPOSTED'" class="voucher-link">
                <el-button link type="primary" size="small" @click="openQuickVoucher(row)">
                  + 认领生单
                </el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="对账" width="110">
            <template #default="{ row }">
              <el-tag :type="row.reconciliationStatus === 'MATCHED' ? 'success' : row.reconciliationStatus === 'PARTIAL' ? 'warning' : 'info'">
                {{ reconciliationLabels[row.reconciliationStatus as ReconciliationStatus] }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" @change="load()"/>
      </el-card>
    </template>

    <!-- 出纳日记账面板 -->
    <template v-else>
      <el-card shadow="never" style="margin-bottom: 16px;">
        <div class="filter-row">
          <el-select v-model="journalAccountCode" placeholder="选择出纳科目" style="width: 220px" @change="loadCashierJournal">
            <el-option label="1001 库存现金" value="1001" />
            <el-option label="1002 银行存款 (全部)" value="1002" />
            <el-option v-for="a in accounts.filter(acc => acc.code.startsWith('1001') || acc.code.startsWith('1002'))" :key="a.id" :label="`${a.code} ${a.name}`" :value="a.code" />
          </el-select>
          <el-date-picker
            v-model="journalDateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 240px"
            @change="loadCashierJournal"
          />
          <el-button type="primary" :loading="journalLoading" @click="loadCashierJournal">查询</el-button>
        </div>
      </el-card>

      <section class="summary-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px;">
        <el-card shadow="never">
          <div style="font-size: 13px; color: #909399;">期初余额</div>
          <div style="font-size: 20px; font-weight: bold; margin-top: 6px;">¥{{ journalData.openingBalance }}</div>
        </el-card>
        <el-card shadow="never">
          <div style="font-size: 13px; color: #67c23a;">本期存入 (借方合计)</div>
          <div style="font-size: 20px; font-weight: bold; color: #67c23a; margin-top: 6px;">+¥{{ journalData.totalDebit }}</div>
        </el-card>
        <el-card shadow="never">
          <div style="font-size: 13px; color: #f56c6c;">本期支取 (贷方合计)</div>
          <div style="font-size: 20px; font-weight: bold; color: #f56c6c; margin-top: 6px;">-¥{{ journalData.totalCredit }}</div>
        </el-card>
        <el-card shadow="never">
          <div style="font-size: 13px; color: #409eff;">期末结存余额</div>
          <div style="font-size: 20px; font-weight: bold; color: #409eff; margin-top: 6px;">¥{{ journalData.closingBalance }}</div>
        </el-card>
      </section>

      <el-card shadow="never">
        <el-table table-layout="auto" v-loading="journalLoading" :data="journalData.entries || []" stripe border>
          <el-table-column prop="date" label="发生日期" width="110" />
          <el-table-column prop="voucherNo" label="记账凭证号" width="140">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push({ path: '/vouchers', query: { keyword: row.voucherNo } })">
                {{ row.voucherNo }}
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="资金科目" width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.accountCode }} {{ row.accountName }}</template>
          </el-table-column>
          <el-table-column prop="summary" label="业务摘要" min-width="180" show-overflow-tooltip />
          <el-table-column prop="debitAmount" label="借方金额(存入)" align="right" width="130">
            <template #default="{ row }">
              <span v-if="Number(row.debitAmount) !== 0" style="color: #67c23a; font-weight: 500;">
                +{{ Number(row.debitAmount).toFixed(2) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="creditAmount" label="贷方金额(支取)" align="right" width="130">
            <template #default="{ row }">
              <span v-if="Number(row.creditAmount) !== 0" style="color: #f56c6c; font-weight: 500;">
                -{{ Number(row.creditAmount).toFixed(2) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="方向" width="60" align="center">
            <template #default="{ row }">
              <el-tag :type="row.direction === 'DEBIT' ? 'success' : row.direction === 'CREDIT' ? 'warning' : 'info'" size="small">
                {{ row.direction === 'DEBIT' ? '借' : row.direction === 'CREDIT' ? '贷' : '平' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="balance" label="结存余额" align="right" width="130">
            <template #default="{ row }"><b>¥{{ Number(row.balance).toFixed(2) }}</b></template>
          </el-table-column>
          <el-table-column label="出纳签字" width="95" align="center">
            <template #default="{ row }">
              <el-tag :type="row.isSigned ? 'success' : 'info'" size="small">
                {{ row.isSigned ? '已签字' : '待签字' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <!-- 一键生成凭证对话框 -->
    <el-dialog v-model="quickVoucherVisible" title="基于银行流水生成凭证" width="560px" destroy-on-close>
      <el-form label-width="110px">
        <el-form-item label="凭证日期" required>
          <el-date-picker v-model="quickVoucherForm.voucherDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="凭证类别" required>
          <el-select v-model="quickVoucherForm.category" style="width: 100%">
            <el-option label="收款凭证" value="RECEIPT" />
            <el-option label="付款凭证" value="PAYMENT" />
          </el-select>
        </el-form-item>
        <el-form-item label="凭证摘要" required>
          <el-input v-model="quickVoucherForm.summary" placeholder="凭证主摘要" />
        </el-form-item>
        <el-form-item label="银行科目" required>
          <el-select v-model="quickVoucherForm.bankAccountId" filterable placeholder="选择银行科目" style="width: 100%">
            <el-option
              v-for="acc in accounts.filter(a => a.code.startsWith('1001') || a.code.startsWith('1002'))"
              :key="acc.id"
              :label="`${acc.code} ${acc.name}`"
              :value="acc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="对应业务科目" required>
          <el-select v-model="quickVoucherForm.counterAccountId" filterable placeholder="选择对方业务科目" style="width: 100%">
            <el-option
              v-for="acc in accounts"
              :key="acc.id"
              :label="`${acc.code} ${acc.name}`"
              :value="acc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="发生金额">
          <el-input v-model="quickVoucherForm.amount" disabled>
            <template #prefix>¥</template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quickVoucherVisible = false">取消</el-button>
        <el-button type="primary" :loading="quickVoucherSaving" @click="submitQuickVoucher">确认生成并入账</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-row { margin-bottom: 0; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.card-title { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.card-title h3 { margin: 0 0 4px; font-size: 16px; }
.card-title p { margin: 0; color: #667085; font-size: 13px; }
.cmb-form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 14px; }
.cmb-form .el-form-item { min-width: 0; }
.cmb-form :deep(.el-form-item__content),
.cmb-form :deep(.el-input),
.cmb-form :deep(.el-select),
.cmb-form :deep(.el-date-editor),
.cmb-form :deep(.el-date-editor.el-input),
.cmb-form :deep(.el-date-editor.el-input__wrapper) { width: 100% !important; min-width: 0; }
.cmb-form .el-form-item { margin-bottom: 12px; }
.cmb-action { align-self: end; }
@media (max-width: 1000px) { .cmb-form { grid-template-columns: repeat(2, minmax(150px, 1fr)); } }
@media (max-width: 600px) {
  .cmb-form { grid-template-columns: 1fr; }
  :deep(.cmb-dialog) { margin: 12px auto; }
  :deep(.cmb-dialog .el-dialog__header),
  :deep(.cmb-dialog .el-dialog__body),
  :deep(.cmb-dialog .el-dialog__footer) { padding-left: 16px; padding-right: 16px; }
  :deep(.cmb-dialog .el-dialog__footer) { display: flex; flex-wrap: wrap; gap: 8px; }
  :deep(.cmb-dialog .el-dialog__footer .el-button) { flex: 1 1 100%; margin: 0; }
}
.voucher-link { margin-top: 4px; }
.amount-in { color: #16a34a; font-weight: 600; }
.amount-out { color: #dc2626; font-weight: 600; }
.cmb-help { grid-column: 1 / -1; margin: 0 0 8px; color: #667085; font-size: 12px; }
</style>
