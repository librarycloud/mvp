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
}

const auth = useAuthStore();
const loading = ref(false);
const saving = ref(false);
const isAdmin = computed(() => auth.user?.role === "ADMIN");
const modeOptions = [
  { label: "简易模式", value: "SIMPLE" },
  { label: "标准模式", value: "STANDARD" },
];
const form = reactive({
  name: "",
  unifiedSocialCreditCode: "",
  bankName: "",
  bankAccount: "",
  operationMode: "SIMPLE" as OperationMode,
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
    });
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!isAdmin.value || !form.name.trim() || !form.unifiedSocialCreditCode.trim()) return;
  saving.value = true;
  try {
    await api.put("/company-profile", form);
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
        <p>维护企业身份、银行账户和业务流程模式。</p>
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
.profile-panel { max-width: 820px; }
.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
.mode-setting { border-top: 1px solid #e5e7eb; padding-top: 22px; }
.mode-description { margin-top: 10px; color: #64748b; line-height: 1.6; }
.form-actions { display: flex; justify-content: flex-end; margin-top: 22px; }
@media (max-width: 720px) { .profile-grid { grid-template-columns: 1fr; } }
</style>
