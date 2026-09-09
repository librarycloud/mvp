<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRouter } from "vue-router";
import { api } from "../utils/api";

const router = useRouter();
const activeTab = ref<"monthly" | "annual">("monthly");

// Monthly PnL state
const periods = ref<any[]>([]);
const selectedPeriodId = ref<number | "">("");
const monthlyProfitAccountId = ref<number | "">("");
const monthlyLoading = ref(false);
const monthlyResult = ref<{ taxVoucher?: string; pnlVoucher?: string } | null>(null);

// Annual closing state
const year = ref(String(new Date().getFullYear()));
const preview = ref<any>();
const accounts = ref<any[]>([]);
const profitAccountId = ref<number | "">("");
const result = ref<any>();
const annualLoading = ref(false);

async function loadAccounts() {
  if (!accounts.value.length) {
    accounts.value = await api.get<any[]>("/accounts");
    const defaultProfit = accounts.value.find((a: any) => a.code === "4103" || a.name?.includes("本年利润"));
    if (defaultProfit) {
      if (!profitAccountId.value) profitAccountId.value = defaultProfit.id;
      if (!monthlyProfitAccountId.value) monthlyProfitAccountId.value = defaultProfit.id;
    }
  }
}

async function loadPeriods() {
  try {
    const list = await api.get<any[]>("/accounting-periods");
    periods.value = list;
    const openPeriod = list.find((p: any) => p.status === 0);
    if (openPeriod) {
      selectedPeriodId.value = openPeriod.id;
    } else if (list.length) {
      selectedPeriodId.value = list[0].id;
    }
  } catch {
    // ignore
  }
}

async function loadPreview() {
  annualLoading.value = true;
  try {
    preview.value = await api.get(`/year-end-closings/${year.value}/preview`);
    await loadAccounts();
  } finally {
    annualLoading.value = false;
  }
}

async function closeAnnual() {
  annualLoading.value = true;
  try {
    result.value = await api.post(`/year-end-closings/${year.value}`, { profitAccountId: profitAccountId.value });
    ElMessage.success("年度结转完成");
  } finally {
    annualLoading.value = false;
  }
}

async function cancelAnnual() {
  const { value } = await ElMessageBox.prompt("请输入撤销原因", "撤销年度结转", {
    inputPattern: /\S+/,
    inputErrorMessage: "撤销原因不能为空",
  });
  annualLoading.value = true;
  try {
    await api.post(`/year-end-closings/${year.value}/cancel`, { reason: value });
    result.value = null;
    ElMessage.success("年度结转已撤销");
    await loadPreview();
  } finally {
    annualLoading.value = false;
  }
}

async function handleAccrueSurcharges() {
  if (!selectedPeriodId.value) return ElMessage.warning("请先选择会计期间");
  monthlyLoading.value = true;
  try {
    const res = await api.post<any>("/tax/accrue-surcharges", { periodId: selectedPeriodId.value });
    const voucherNo = res?.voucherNo || res?.voucher?.voucherNo || "已生成";
    ElMessage.success(`附加税费计提凭证生成成功：${voucherNo}`);
    if (!monthlyResult.value) monthlyResult.value = {};
    monthlyResult.value.taxVoucher = voucherNo;
  } finally {
    monthlyLoading.value = false;
  }
}

async function handleCloseMonthlyPnl() {
  if (!selectedPeriodId.value) return ElMessage.warning("请先选择会计期间");
  monthlyLoading.value = true;
  try {
    const body: any = { periodId: selectedPeriodId.value };
    if (monthlyProfitAccountId.value) {
      body.profitAccountId = Number(monthlyProfitAccountId.value);
    }
    const res = await api.post<any>("/year-end-closings/monthly-pnl", body);
    const voucherNo = res?.voucherNo || res?.voucher?.voucherNo || "已生成";
    ElMessage.success(`月度账结损益凭证生成成功：${voucherNo}`);
    if (!monthlyResult.value) monthlyResult.value = {};
    monthlyResult.value.pnlVoucher = voucherNo;
  } finally {
    monthlyLoading.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadAccounts(), loadPeriods()]);
});
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div>
        <h2>期末与年末结转</h2>
        <p>提供月度账结损益、附加税费一键计提以及年末利润结转全套期末处理。</p>
      </div>
    </section>

    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <!-- Tab 1: Monthly PnL & Accruals -->
        <el-tab-pane label="月度期末结转套件" name="monthly">
          <div v-loading="monthlyLoading" style="max-width: 800px; padding: 8px 0;">
            <el-alert
              type="info"
              :closable="false"
              show-icon
              title="中国企业会计准则 (CAS) 月末规范结账处理"
              description="在会计期间月末关账前，依次计提增值税附加税费、自动账结当期损益转入「本年利润」，确保损益类科目余额清零。"
              style="margin-bottom: 20px;"
            />

            <el-form label-width="120px" style="margin-bottom: 20px;">
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="目标会计期间">
                    <el-select v-model="selectedPeriodId" placeholder="选择会计期间" style="width: 100%;">
                      <el-option
                        v-for="p in periods"
                        :key="p.id"
                        :label="`${p.periodCode} (${p.status === 0 ? '打开' : p.status === 1 ? '已关账' : '已锁定'})`"
                        :value="p.id"
                      />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="本年利润科目">
                    <el-select v-model="monthlyProfitAccountId" filterable placeholder="选择本年利润科目" style="width: 100%;">
                      <el-option
                        v-for="a in accounts"
                        :key="a.id"
                        :label="`${a.code} ${a.name}`"
                        :value="a.id"
                      />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>

            <el-card shadow="never" style="margin-bottom: 16px;">
              <template #header>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: 600;">环节一：一键计提附加税费</span>
                  <el-tag size="small" type="primary">增值税附加税费</el-tag>
                </div>
              </template>
              <p style="font-size: 13px; color: #606266; margin-top: 0;">
                自动按当期应交增值税税额，计算并生成城建税 (7%)、教育费附加 (3%)、地方教育附加 (2%) 计提凭证，计入「税金及附加」。
              </p>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
                <span v-if="monthlyResult?.taxVoucher" style="color: #67c23a; font-size: 13px;">
                  ✓ 已生成凭证：<strong>{{ monthlyResult.taxVoucher }}</strong>
                </span>
                <span v-else style="color: #909399; font-size: 13px;">尚未生成当期计提凭证</span>
                <el-button type="primary" plain :disabled="!selectedPeriodId" @click="handleAccrueSurcharges">
                  立即计提附加税费
                </el-button>
              </div>
            </el-card>

            <el-card shadow="never" style="margin-bottom: 16px;">
              <template #header>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: 600;">环节二：月度账结损益</span>
                  <el-tag size="small" type="success">损益科目归零</el-tag>
                </div>
              </template>
              <p style="font-size: 13px; color: #606266; margin-top: 0;">
                自动扫描当期全部 5xxx/6xxx 损益类科目期末净发生额，自动生成结转凭证转入「4103 本年利润」，实现各损益科目期末余额归零。
              </p>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
                <span v-if="monthlyResult?.pnlVoucher" style="color: #67c23a; font-size: 13px;">
                  ✓ 已生成凭证：<strong>{{ monthlyResult.pnlVoucher }}</strong>
                </span>
                <span v-else style="color: #909399; font-size: 13px;">尚未生成当期损益结转凭证</span>
                <el-button type="success" plain :disabled="!selectedPeriodId || !monthlyProfitAccountId" @click="handleCloseMonthlyPnl">
                  立即结转月度损益
                </el-button>
              </div>
            </el-card>

            <div style="margin-top: 20px; display: flex; gap: 12px;">
              <el-button @click="router.push('/vouchers')">查看凭证列表</el-button>
              <el-button type="primary" plain @click="router.push('/accounting-periods')">前往会计期间月末关账 →</el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 2: Annual Closing -->
        <el-tab-pane label="年末利润结转" name="annual">
          <div v-loading="annualLoading">
            <div class="toolbar" style="margin-bottom: 16px;">
              <el-input v-model="year" placeholder="年度" style="width: 120px;" />
              <el-select v-model="profitAccountId" filterable placeholder="本年利润科目" style="width: 240px;">
                <el-option v-for="a in accounts" :key="a.id" :label="`${a.code} ${a.name}`" :value="a.id" />
              </el-select>
              <el-button @click="loadPreview">试运行预览</el-button>
              <el-button type="primary" :disabled="!preview || !profitAccountId" @click="closeAnnual">正式结转</el-button>
              <el-button v-if="result" type="danger" @click="cancelAnnual">撤销结转</el-button>
            </div>

            <el-card v-if="preview" shadow="never" style="margin-top: 16px;">
              <el-descriptions :column="4" border style="margin-bottom: 16px;">
                <el-descriptions-item label="收入">{{ preview.revenueAmount }}</el-descriptions-item>
                <el-descriptions-item label="成本">{{ preview.costAmount }}</el-descriptions-item>
                <el-descriptions-item label="费用">{{ preview.expenseAmount }}</el-descriptions-item>
                <el-descriptions-item label="本年利润">{{ preview.netProfit }}</el-descriptions-item>
              </el-descriptions>
              <el-table table-layout="auto" :data="preview.lines" stripe>
                <el-table-column prop="code" label="科目编码" />
                <el-table-column prop="name" label="科目名称" />
                <el-table-column prop="kind" label="类型" />
                <el-table-column prop="amount" label="结转金额" />
              </el-table>
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>
