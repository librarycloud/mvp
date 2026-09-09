<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../utils/api";
import { useClientPagination } from "../composables/useClientPagination";
import { todayBusinessDate } from "../utils/date";
import { ElMessage } from "element-plus";
const STATUS = { ACTIVE: 0, INACTIVE: 1, DISCARDED: 2, SOLD: 3 } as const;
const labels: Record<number, string> = { 0: "启用", 1: "停用", 2: "报废", 3: "出售" };
const postingLabels: Record<number, string> = { 2: "已记账", 3: "作废" };
const assetCategories = ["房屋及建筑物", "机器设备", "运输设备", "电子设备", "办公设备", "摄影器材", "家具及器具", "其他"];
const rows = ref<any[]>([]);
const { page, pageSize, total, pagedRows } = useClientPagination(rows);
const loading = ref(false); const dialog = ref(false); const detailDialog = ref(false); const disposalDialog = ref(false);
const accounts = ref<any[]>([]);
const depreciationExpenseAccounts = computed(() => accounts.value.filter(account => account.isLeaf && ["COST", "PROFIT_AND_LOSS"].includes(account.category)));
const depreciationMethodLabels: Record<string, string> = {
  STRAIGHT_LINE: "年限平均法",
  DOUBLE_DECLINING: "双倍余额递减法",
  SUM_OF_YEARS: "年数总和法",
};
const editingId = ref<number | "">(""); const detail = ref<any>(); const attachments = ref<any[]>([]);
const blank = () => ({ assetNo: "", name: "", category: "", purchaseDate: "", startUseDate: "", originalValue: "", residualRate: "0.05", depreciationMethod: "STRAIGHT_LINE", usefulLifeMonths: 60, depreciationExpenseAccountId: "" as number | "", department: "", custodian: "" });
function money(value: unknown) { return Number(value ?? 0).toFixed(2); }
function moneyFormatter(_row: unknown, _column: unknown, value: unknown) { return money(value); }
const form = ref<any>(blank()); const disposalForm = ref<any>({ disposalType: "DISCARD", disposalDate: "", proceeds: "0", proceedsAccountId: undefined, gainLossAccountId: undefined, reason: "" });
async function load() { loading.value = true; try { rows.value = await api.get<any[]>("/fixed-assets"); if (!accounts.value.length) accounts.value = await api.get<any[]>("/accounts?tree=false&isEnabled=true"); } finally { loading.value = false; } }
function create() { editingId.value = ""; form.value = blank(); dialog.value = true; }
function edit(row: any) { editingId.value = row.id; form.value = { ...row, purchaseDate: String(row.purchaseDate).slice(0, 10), startUseDate: String(row.startUseDate).slice(0, 10), originalValue: String(row.originalValue), residualRate: String(row.residualRate), depreciationMethod: row.depreciationMethod ?? "STRAIGHT_LINE", department: row.department ?? "", custodian: row.custodian ?? "" }; dialog.value = true; }
async function save() { const payload = { ...form.value, depreciationExpenseAccountId: form.value.depreciationExpenseAccountId || undefined }; if (editingId.value) await api.put(`/fixed-assets/${editingId.value}`, payload); else await api.post("/fixed-assets", payload); dialog.value = false; await load(); }
async function changeStatus(row: any, value: string | number | object) { await api.post(`/fixed-assets/${row.id}/status`, { status: Number(value) }); await load(); }
async function show(row: any) { detail.value = await api.get(`/fixed-assets/${row.id}`); attachments.value = await api.get<any[]>(`/attachments/source/FixedAsset/${detail.value.id}`); detailDialog.value = true; }
function openDisposal(row: any) { detail.value = row; disposalForm.value = { disposalType: "DISCARD", disposalDate: new Date().toISOString().slice(0, 10), proceeds: "0", proceedsAccountId: accounts.value.find((x) => x.code === "1002")?.id, gainLossAccountId: accounts.value.find((x) => x.code === "6115")?.id, reason: "" }; disposalDialog.value = true; }
async function dispose() { if (!detail.value) return; await api.post(`/fixed-assets/${detail.value.id}/disposal`, disposalForm.value); disposalDialog.value = false; detail.value = await api.get(`/fixed-assets/${detail.value.id}`); await load(); }
async function upload(event: Event) { const file = (event.target as HTMLInputElement).files?.[0]; if (!file || !detail.value) return; await api.upload(`/attachments/upload?sourceType=FixedAsset&sourceId=${detail.value.id}&relationType=OTHER`, file); attachments.value = await api.get<any[]>(`/attachments/source/FixedAsset/${detail.value.id}`); }

// 长期待摊费用
const activeTab = ref<"fixedAssets" | "deferredExpenses">("fixedAssets");
const deferredExpenses = ref<any[]>([]);
const deferredLoading = ref(false);
const deferredDialog = ref(false);
const amortizeDialog = ref(false);
const amortizePeriodId = ref<number | "">("");
const amortizing = ref(false);
const periods = ref<any[]>([]);

const deferredForm = ref({
  expenseNo: "",
  name: "",
  totalAmount: "",
  startDate: todayBusinessDate(),
  totalPeriods: 12,
  expenseAccountId: "" as number | "",
  description: "",
});

async function loadDeferred() {
  deferredLoading.value = true;
  try {
    const [expenses, periodList] = await Promise.all([
      api.get<any[]>("/deferred-expenses"),
      api.get<any[]>("/accounting-periods"),
    ]);
    deferredExpenses.value = expenses;
    periods.value = periodList;
    if (periodList.length && !amortizePeriodId.value) {
      const openP = periodList.find((p: any) => p.status === 0);
      if (openP) amortizePeriodId.value = openP.id;
    }
  } finally {
    deferredLoading.value = false;
  }
}

function openCreateExpense() {
  deferredForm.value = {
    expenseNo: `DEF-${Date.now().toString().slice(-6)}`,
    name: "",
    totalAmount: "",
    startDate: todayBusinessDate(),
    totalPeriods: 12,
    expenseAccountId: "",
    description: "",
  };
  deferredDialog.value = true;
}

async function saveDeferred() {
  if (!deferredForm.value.name.trim() || !deferredForm.value.totalAmount) {
    ElMessage.warning("请填写长期待摊费用名称与总金额");
    return;
  }
  await api.post("/deferred-expenses", {
    expenseNo: deferredForm.value.expenseNo,
    name: deferredForm.value.name.trim(),
    totalAmount: deferredForm.value.totalAmount,
    startDate: deferredForm.value.startDate,
    totalPeriods: Number(deferredForm.value.totalPeriods),
    expenseAccountId: deferredForm.value.expenseAccountId ? Number(deferredForm.value.expenseAccountId) : undefined,
    description: deferredForm.value.description,
  });
  ElMessage.success("长期待摊费用登记成功");
  deferredDialog.value = false;
  await loadDeferred();
}

async function executeAmortize() {
  if (!amortizePeriodId.value) {
    ElMessage.warning("请选择要计提摊销的会计期间");
    return;
  }
  amortizing.value = true;
  try {
    const res = await api.post<any>("/deferred-expenses/amortize", {
      periodId: Number(amortizePeriodId.value),
    });
    ElMessage.success(`长期待摊费用按月摊销完成：共计提 ${res.generatedCount} 笔凭证`);
    amortizeDialog.value = false;
    await loadDeferred();
  } catch (err: any) {
    ElMessage.error(err?.message || "摊销失败");
  } finally {
    amortizing.value = false;
  }
}

onMounted(() => {
  void load();
  void loadDeferred();
});
</script>
<template>
  <div class="page-grid">
    <section class="page-heading">
      <div>
        <h2>资产与费用管理</h2>
        <p>固定资产卡片台账、状态与折旧明细，以及长期待摊费用（1801）按月自动摊销。</p>
      </div>
      <div style="display: flex; gap: 10px;">
        <template v-if="activeTab === 'fixedAssets'">
          <el-button type="primary" @click="create">新增资产</el-button>
        </template>
        <template v-else>
          <el-button type="success" plain @click="amortizeDialog = true">按月自动计提摊销</el-button>
          <el-button type="primary" @click="openCreateExpense">登记长期待摊费用</el-button>
        </template>
      </div>
    </section>

    <el-tabs v-model="activeTab" style="margin-bottom: 12px;">
      <el-tab-pane label="固定资产台账" name="fixedAssets" />
      <el-tab-pane label="长期待摊费用 (按月摊销)" name="deferredExpenses" />
    </el-tabs>

    <template v-if="activeTab === 'fixedAssets'">
      <el-card shadow="never">
        <el-table table-layout="auto" v-loading="loading" :data="pagedRows" stripe>
          <el-table-column prop="assetNo" label="资产编号"/>
          <el-table-column prop="name" label="资产名称"/>
          <el-table-column prop="category" label="类别"/>
          <el-table-column label="折旧方法" width="130">
            <template #default="scope">
              <el-tag size="small" :type="scope.row.depreciationMethod === 'DOUBLE_DECLINING' || scope.row.depreciationMethod === 'SUM_OF_YEARS' ? 'warning' : 'info'">
                {{ depreciationMethodLabels[scope.row.depreciationMethod] ?? scope.row.depreciationMethod ?? '年限平均法' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="originalValue" label="原值" :formatter="moneyFormatter"/>
          <el-table-column prop="accumulatedDepreciation" label="累计折旧" :formatter="moneyFormatter"/>
          <el-table-column prop="netValue" label="净值" :formatter="moneyFormatter"/>
          <el-table-column prop="department" label="使用部门"/>
          <el-table-column label="状态"><template #default="scope">{{ labels[scope.row.status] ?? scope.row.status }}</template></el-table-column>
          <el-table-column label="操作">
            <template #default="scope">
              <el-button text @click="show(scope.row)">详情</el-button>
              <el-button text @click="edit(scope.row)">编辑</el-button>
              <el-button v-if="![STATUS.DISCARDED, STATUS.SOLD].includes(scope.row.status)" text type="warning" @click="openDisposal(scope.row)">处置</el-button>
              <el-dropdown v-if="![STATUS.DISCARDED, STATUS.SOLD].includes(scope.row.status)" @command="changeStatus(scope.row, $event)">
                <el-button text>状态</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="0">启用</el-dropdown-item>
                    <el-dropdown-item command="1">停用</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
        <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total"/>
      </el-card>
    </template>

    <template v-else>
      <el-card shadow="never">
        <el-table table-layout="auto" v-loading="deferredLoading" :data="deferredExpenses" stripe border>
          <el-table-column prop="expenseNo" label="费用编号" width="130" />
          <el-table-column prop="name" label="费用项目名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="totalAmount" label="原值金额" align="right" width="120">
            <template #default="{ row }"><b>¥{{ money(row.totalAmount) }}</b></template>
          </el-table-column>
          <el-table-column prop="amortizedAmount" label="已摊销" align="right" width="110">
            <template #default="{ row }"><span style="color: #67c23a;">¥{{ money(row.amortizedAmount) }}</span></template>
          </el-table-column>
          <el-table-column prop="remainingAmount" label="剩余未摊销" align="right" width="120">
            <template #default="{ row }"><span style="color: #409eff; font-weight: 600;">¥{{ money(row.remainingAmount) }}</span></template>
          </el-table-column>
          <el-table-column label="摊销进度" width="110" align="center">
            <template #default="{ row }">
              <el-tag size="small">{{ row.amortizedPeriods }} / {{ row.totalPeriods }} 期</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="monthlyAmortization" label="每期摊销额" align="right" width="120">
            <template #default="{ row }">¥{{ money(row.monthlyAmortization) }}</template>
          </el-table-column>
          <el-table-column prop="startDate" label="开始日期" width="110">
            <template #default="{ row }">{{ String(row.startDate).slice(0, 10) }}</template>
          </el-table-column>
          <el-table-column label="费用归集科目" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.expenseAccount">{{ row.expenseAccount.code }} {{ row.expenseAccount.name }}</span>
              <span v-else style="color: #909399;">6602 管理费用</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'AMORTIZING' ? 'success' : 'info'" size="small">
                {{ row.status === 'AMORTIZING' ? '摊销中' : row.status === 'COMPLETED' ? '已摊毕' : '待处理' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>

  <!-- 登记长期待摊费用对话框 -->
  <el-dialog v-model="deferredDialog" title="登记长期待摊费用" width="560px">
    <el-form label-width="120px">
      <el-form-item label="费用编号" required><el-input v-model="deferredForm.expenseNo" /></el-form-item>
      <el-form-item label="项目名称" required><el-input v-model="deferredForm.name" placeholder="如：办公室装修改造费、软件授权费等" /></el-form-item>
      <el-form-item label="原值总金额" required><el-input v-model="deferredForm.totalAmount" placeholder="0.00" /></el-form-item>
      <el-form-item label="起始摊销日期" required><el-date-picker v-model="deferredForm.startDate" value-format="YYYY-MM-DD" type="date" style="width: 100%;" /></el-form-item>
      <el-form-item label="摊销总期数(月)" required><el-input-number v-model="deferredForm.totalPeriods" :min="1" :max="120" style="width: 100%;" /></el-form-item>
      <el-form-item label="费用计入科目">
        <el-select v-model="deferredForm.expenseAccountId" clearable filterable placeholder="默认 6602 管理费用" style="width: 100%;">
          <el-option v-for="a in accounts.filter(acc => acc.isLeaf && (acc.code.startsWith('6602') || acc.code.startsWith('6601') || acc.code.startsWith('5001')))" :key="a.id" :label="`${a.code} ${a.name}`" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="说明备注"><el-input v-model="deferredForm.description" type="textarea" :rows="2" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="deferredDialog = false">取消</el-button>
      <el-button type="primary" @click="saveDeferred">确认登记</el-button>
    </template>
  </el-dialog>

  <!-- 按月自动摊销计提对话框 -->
  <el-dialog v-model="amortizeDialog" title="长期待摊费用按月自动计提摊销" width="460px">
    <el-form label-width="110px">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
        系统将对全部在摊费用按月计算当期摊销额，并借记费用科目（6602），贷记长期待摊费用（1801），自动生成已记账凭证。
      </el-alert>
      <el-form-item label="归属会计期间" required>
        <el-select v-model="amortizePeriodId" placeholder="选择会计期间" style="width: 100%;">
          <el-option v-for="p in periods" :key="p.id" :label="`${p.periodCode} (${p.status === 0 ? '未结账' : '已关账'})`" :value="p.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="amortizeDialog = false">取消</el-button>
      <el-button type="primary" :loading="amortizing" @click="executeAmortize">立即计提摊销</el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="dialog" :title="editingId ? '编辑固定资产' : '新增固定资产'" width="620px"><el-form label-width="110px"><el-form-item label="资产编号"><el-input v-model="form.assetNo"/></el-form-item><el-form-item label="资产名称"><el-input v-model="form.name"/></el-form-item><el-form-item label="资产类别"><el-select v-model="form.category" filterable allow-create default-first-option placeholder="请选择资产类别" style="width:100%"><el-option v-for="category in assetCategories" :key="category" :label="category" :value="category"/></el-select></el-form-item><el-form-item label="购买日期"><el-date-picker v-model="form.purchaseDate" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="启用日期"><el-date-picker v-model="form.startUseDate" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="原值"><el-input v-model="form.originalValue"/></el-form-item><el-form-item label="残值率"><el-input v-model="form.residualRate"/></el-form-item><el-form-item label="折旧年限（月）"><el-input-number v-model="form.usefulLifeMonths" :min="1"/></el-form-item><el-form-item label="折旧方法"><el-select v-model="form.depreciationMethod" style="width:100%"><el-option label="年限平均法 (直线法)" value="STRAIGHT_LINE"/><el-option label="双倍余额递减法 (加速折旧)" value="DOUBLE_DECLINING"/><el-option label="年数总和法 (加速折旧)" value="SUM_OF_YEARS"/></el-select></el-form-item><el-form-item label="折旧费用科目"><el-select v-model="form.depreciationExpenseAccountId" clearable filterable placeholder="未选择时使用计提页面默认科目" style="width:100%"><el-option v-for="account in depreciationExpenseAccounts" :key="account.id" :label="`${account.code} ${account.name}`" :value="account.id"/></el-select></el-form-item><el-form-item label="使用部门"><el-input v-model="form.department"/></el-form-item><el-form-item label="保管人"><el-input v-model="form.custodian"/></el-form-item></el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
  <el-drawer v-model="detailDialog" title="固定资产详情" size="55%"><template v-if="detail"><el-descriptions :column="2" border><el-descriptions-item label="资产">{{ detail.assetNo }} {{ detail.name }}</el-descriptions-item><el-descriptions-item label="状态">{{ labels[detail.status] ?? detail.status }}</el-descriptions-item><el-descriptions-item label="原值">{{ money(detail.originalValue) }}</el-descriptions-item><el-descriptions-item label="净值">{{ money(detail.netValue) }}</el-descriptions-item></el-descriptions><h3>附件</h3><input type="file" accept=".pdf,.xml,image/*" @change="upload"/><el-table table-layout="auto" :data="attachments" size="small"><el-table-column prop="attachment.originalName" label="文件名"/><el-table-column prop="relationType" label="类型"/></el-table><h3>处置记录</h3><el-table :data="detail.disposals || []" size="small"><el-table-column prop="disposalDate" label="处置日期"/><el-table-column prop="disposalType" label="方式"/><el-table-column prop="proceeds" label="处置收入" :formatter="moneyFormatter"/><el-table-column prop="netBookValue" label="账面净值" :formatter="moneyFormatter"/><el-table-column prop="gainLoss" label="处置损益" :formatter="moneyFormatter"/><el-table-column label="凭证"><template #default="scope">{{ scope.row.voucher?.voucherNo || "-" }}</template></el-table-column></el-table><h3>折旧明细</h3><el-table table-layout="auto" :data="detail.depreciationRecords" size="small"><el-table-column prop="period.periodCode" label="期间"/><el-table-column prop="amount" label="金额" :formatter="moneyFormatter"/><el-table-column label="状态"><template #default="scope">{{ postingLabels[scope.row.status] ?? scope.row.status }}</template></el-table-column><el-table-column prop="voucher.voucherNo" label="凭证"/></el-table></template></el-drawer>
  <el-dialog v-model="disposalDialog" title="固定资产处置" width="500px"><el-form label-width="100px"><el-form-item label="处置方式"><el-select v-model="disposalForm.disposalType"><el-option label="报废" value="DISCARD"/><el-option label="出售" value="SALE"/></el-select></el-form-item><el-form-item label="处置日期"><el-date-picker v-model="disposalForm.disposalDate" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="处置收入"><el-input v-model="disposalForm.proceeds"/></el-form-item><el-form-item label="收款科目"><el-select v-model="disposalForm.proceedsAccountId" filterable clearable><el-option v-for="account in accounts" :key="account.id" :label="`${account.code} ${account.name}`" :value="account.id"/></el-select></el-form-item><el-form-item label="损益科目"><el-select v-model="disposalForm.gainLossAccountId" filterable><el-option v-for="account in accounts" :key="account.id" :label="`${account.code} ${account.name}`" :value="account.id"/></el-select></el-form-item><el-form-item label="原因"><el-input v-model="disposalForm.reason" type="textarea" maxlength="500" show-word-limit/></el-form-item></el-form><template #footer><el-button @click="disposalDialog=false">取消</el-button><el-button type="primary" @click="dispose">保存并生成凭证</el-button></template></el-dialog>
</template>
