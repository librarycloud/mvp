<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useAuthStore } from "../stores/auth";
import { api } from "../utils/api";

type OperationMode = "SIMPLE" | "STANDARD";

interface CompanyProfile {
  name: string;
  unifiedSocialCreditCode: string;
  bankName: string | null;
  bankAccount: string | null;
  operationMode: OperationMode;
  vatTaxpayerType: "UNKNOWN" | "SMALL_SCALE" | "GENERAL";
  vatFilingPeriod: "UNKNOWN" | "MONTH" | "QUARTER";
  citFilingPeriod: "UNKNOWN" | "MONTH" | "QUARTER";
  citTaxCollectionMethod: "UNKNOWN" | "ACCOUNTING" | "ASSESSED";
  smallProfitEnterpriseEligible: "UNKNOWN" | "YES" | "NO";
  surchargeReductionEligible: "UNKNOWN" | "YES" | "NO";
  urbanMaintenanceRate: string | null;
  educationSurchargeRate: string;
  localEducationSurchargeRate: string;
  surchargeReductionRate: string;
}

const auth = useAuthStore();
const loading = ref(false);
const saving = ref(false);
const isAdmin = computed(() => auth.user?.role === "ADMIN");
const modeOptions = [
  { label: "简易模式", value: "SIMPLE" },
  { label: "标准模式", value: "STANDARD" },
];
const unknownOption = { label: "未确认", value: "UNKNOWN" };
const form = reactive({
  name: "",
  unifiedSocialCreditCode: "",
  bankName: "",
  bankAccount: "",
  operationMode: "SIMPLE" as OperationMode,
  vatTaxpayerType: "UNKNOWN" as CompanyProfile["vatTaxpayerType"],
  vatFilingPeriod: "UNKNOWN" as CompanyProfile["vatFilingPeriod"],
  citFilingPeriod: "UNKNOWN" as CompanyProfile["citFilingPeriod"],
  citTaxCollectionMethod: "UNKNOWN" as CompanyProfile["citTaxCollectionMethod"],
  smallProfitEnterpriseEligible: "UNKNOWN" as CompanyProfile["smallProfitEnterpriseEligible"],
  surchargeReductionEligible: "UNKNOWN" as CompanyProfile["surchargeReductionEligible"],
  urbanMaintenanceRate: null as number | null,
  educationSurchargeRate: 3,
  localEducationSurchargeRate: 2,
  surchargeReductionRate: 0,
});
const modeDescription = computed(() => form.operationMode === "SIMPLE"
  ? "税务底稿可直接登记申报，报销和开票申请自动通过，预算超额仅提醒。"
  : "保留税务复核、报销审批和开票审批节点，预算超额时拦截。",
);

async function load() {
  loading.value = true;
  try {
    const profile = await api.get<CompanyProfile | null>("/company-profile");
    if (!profile) return;
    Object.assign(form, {
      name: profile.name,
      unifiedSocialCreditCode: profile.unifiedSocialCreditCode,
      bankName: profile.bankName ?? "",
      bankAccount: profile.bankAccount ?? "",
      operationMode: profile.operationMode,
      vatTaxpayerType: profile.vatTaxpayerType,
      vatFilingPeriod: profile.vatFilingPeriod,
      citFilingPeriod: profile.citFilingPeriod,
      citTaxCollectionMethod: profile.citTaxCollectionMethod,
      smallProfitEnterpriseEligible: profile.smallProfitEnterpriseEligible,
      surchargeReductionEligible: profile.surchargeReductionEligible,
      urbanMaintenanceRate: profile.urbanMaintenanceRate == null ? null : Number(profile.urbanMaintenanceRate) * 100,
      educationSurchargeRate: Number(profile.educationSurchargeRate) * 100,
      localEducationSurchargeRate: Number(profile.localEducationSurchargeRate) * 100,
      surchargeReductionRate: Number(profile.surchargeReductionRate) * 100,
    });
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!isAdmin.value || !form.name.trim() || !form.unifiedSocialCreditCode.trim()) return;
  saving.value = true;
  try {
    await api.put("/company-profile", {
      ...form,
      urbanMaintenanceRate: form.urbanMaintenanceRate == null ? null : String(form.urbanMaintenanceRate / 100),
      educationSurchargeRate: String(form.educationSurchargeRate / 100),
      localEducationSurchargeRate: String(form.localEducationSurchargeRate / 100),
      surchargeReductionRate: String(form.surchargeReductionRate / 100),
    });
    ElMessage.success("企业资料已保存，发票方向已重新识别");
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div>
        <h2>企业资料</h2>
        <p>维护企业身份、银行账户和申报口径。</p>
      </div>
    </section>

    <el-alert v-if="!isAdmin" type="info" :closable="false" show-icon title="只有系统管理员可以修改企业资料。" />

    <el-card v-loading="loading" shadow="never" class="profile-panel">
      <el-form label-position="top" :disabled="!isAdmin">
        <div class="profile-grid">
          <el-form-item label="企业名称" required>
            <el-input v-model="form.name" maxlength="200" />
          </el-form-item>
          <el-form-item label="统一社会信用代码" required>
            <el-input v-model="form.unifiedSocialCreditCode" maxlength="18" />
          </el-form-item>
          <el-form-item label="开户银行">
            <el-input v-model="form.bankName" maxlength="200" />
          </el-form-item>
          <el-form-item label="银行账号">
            <el-input v-model="form.bankAccount" maxlength="100" />
          </el-form-item>
        </div>

        <el-form-item label="流程模式" class="mode-setting">
          <el-segmented v-model="form.operationMode" :options="modeOptions" :disabled="!isAdmin" />
          <div class="mode-description">{{ modeDescription }}</div>
        </el-form-item>

        <el-divider content-position="left">企业税务口径</el-divider>
        <el-alert class="tax-guidance" type="info" :closable="false" show-icon title="请按电子税务局登记信息填写。未确认的口径不会用于生成申报测算底稿。" />
        <div class="profile-grid tax-grid">
          <el-form-item label="增值税纳税人类型">
            <el-select v-model="form.vatTaxpayerType"><el-option :label="unknownOption.label" :value="unknownOption.value"/><el-option label="小规模纳税人" value="SMALL_SCALE"/><el-option label="一般纳税人" value="GENERAL"/></el-select>
          </el-form-item>
          <el-form-item label="增值税申报周期">
            <el-select v-model="form.vatFilingPeriod"><el-option :label="unknownOption.label" :value="unknownOption.value"/><el-option label="按月" value="MONTH"/><el-option label="按季" value="QUARTER"/></el-select>
          </el-form-item>
          <el-form-item label="企业所得税预缴周期">
            <el-select v-model="form.citFilingPeriod"><el-option :label="unknownOption.label" :value="unknownOption.value"/><el-option label="按月" value="MONTH"/><el-option label="按季" value="QUARTER"/></el-select>
          </el-form-item>
          <el-form-item label="企业所得税征收方式">
            <el-select v-model="form.citTaxCollectionMethod"><el-option :label="unknownOption.label" :value="unknownOption.value"/><el-option label="查账征收" value="ACCOUNTING"/><el-option label="核定征收（暂不自动测算）" value="ASSESSED"/></el-select>
          </el-form-item>
          <el-form-item label="小型微利企业优惠资格">
            <el-select v-model="form.smallProfitEnterpriseEligible"><el-option :label="unknownOption.label" :value="unknownOption.value"/><el-option label="符合" value="YES"/><el-option label="不符合" value="NO"/></el-select>
          </el-form-item>
          <el-form-item label="附加税费减征资格">
            <el-select v-model="form.surchargeReductionEligible"><el-option :label="unknownOption.label" :value="unknownOption.value"/><el-option label="符合减征条件" value="YES"/><el-option label="不适用减征" value="NO"/></el-select>
          </el-form-item>
          <el-form-item label="城建税率（按所在地确认）">
            <el-select v-model="form.urbanMaintenanceRate" clearable placeholder="请选择所在地适用税率"><el-option label="市区 7%" :value="7"/><el-option label="县城、镇 5%" :value="5"/><el-option label="其他地区 1%" :value="1"/></el-select>
          </el-form-item>
          <el-form-item label="教育费附加率（%）"><el-input-number v-model="form.educationSurchargeRate" :min="0" :max="100" :precision="2" :step="0.5" controls-position="right" /></el-form-item>
          <el-form-item label="地方教育附加率（%）"><el-input-number v-model="form.localEducationSurchargeRate" :min="0" :max="100" :precision="2" :step="0.5" controls-position="right" /></el-form-item>
          <el-form-item label="符合时减征比例（%）"><el-input-number v-model="form.surchargeReductionRate" :min="0" :max="100" :precision="2" :step="1" controls-position="right" :disabled="form.surchargeReductionEligible !== 'YES'" /></el-form-item>
        </div>

        <div class="form-actions">
          <el-button
            v-if="isAdmin"
            type="primary"
            :loading="saving"
            :disabled="!form.name.trim() || !form.unifiedSocialCreditCode.trim()"
            @click="save"
          >保存设置</el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.profile-panel { max-width: 900px; }
.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
.tax-grid { margin-top: 14px; }
.tax-grid :deep(.el-input-number),.tax-grid :deep(.el-select) { width: 100%; }
.tax-guidance { margin: 8px 0 14px; }
.mode-setting { border-top: 1px solid #e5e7eb; padding-top: 22px; }
.mode-description { margin-top: 10px; color: #64748b; line-height: 1.6; }
.form-actions { display: flex; justify-content: flex-end; margin-top: 22px; }
@media (max-width: 720px) { .profile-grid { grid-template-columns: 1fr; } }
</style>
