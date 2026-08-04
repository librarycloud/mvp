<script setup lang="ts">
import { Edit, Plus, Timer } from "@element-plus/icons-vue";
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../utils/api";
import { ROLE_LABELS, type UserRole } from "../stores/auth";

interface UserRow { id: number; username: string; displayName: string; role: UserRole; status: number; lastLoginAt: string | null; createdAt: string }
const rows = ref<UserRow[]>([]);
const loading = ref(false);
const visible = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);
const idleTimeoutMinutes = ref(30);
const savingTimeout = ref(false);
const form = reactive({ username: "", displayName: "", password: "", role: "ACCOUNTANT" as UserRole, status: 0 });
const title = computed(() => editingId.value ? "编辑用户" : "新增用户");
const roleOptions = (Object.entries(ROLE_LABELS) as Array<[UserRole, string]>).map(([value, label]) => ({ value, label }));

async function load() {
  loading.value = true;
  try {
    const [users, settings] = await Promise.all([
      api.get<UserRow[]>("/users"),
      api.get<{ idleTimeoutMinutes: number }>("/users/session-settings"),
    ]);
    rows.value = users; idleTimeoutMinutes.value = settings.idleTimeoutMinutes;
  } finally { loading.value = false; }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, { username: "", displayName: "", password: "", role: "ACCOUNTANT", status: 0 });
  visible.value = true;
}

function openEdit(row: UserRow) {
  editingId.value = row.id;
  Object.assign(form, { username: row.username, displayName: row.displayName, password: "", role: row.role, status: row.status });
  visible.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editingId.value) {
      const body: { displayName: string; role: UserRole; status: number; password?: string } = { displayName: form.displayName, role: form.role, status: form.status };
      if (form.password) body.password = form.password;
      await api.put(`/users/${editingId.value}`, body);
    } else {
      await api.post("/users", { username: form.username, displayName: form.displayName, password: form.password, role: form.role });
    }
    ElMessage.success("用户已保存"); visible.value = false; await load();
  } finally { saving.value = false; }
}

async function saveTimeout() {
  savingTimeout.value = true;
  try {
    await api.put("/users/session-settings", { idleTimeoutMinutes: idleTimeoutMinutes.value });
    ElMessage.success("无操作退出时间已更新，新会话将立即使用该设置");
  } finally { savingTimeout.value = false; }
}

async function updateStatus(row: UserRow, enabled: boolean) {
  const previousStatus = row.status;
  row.status = enabled ? 0 : 1;
  try {
    await api.put(`/users/${row.id}`, { status: row.status });
    ElMessage.success(enabled ? "用户已启用" : "用户已停用");
  } catch {
    row.status = previousStatus;
  }
}

onMounted(load);
</script>

<template>
  <section class="page-stack">
    <div class="page-header"><div><h1>用户与会话设置</h1><p>管理企业内部账号、职责和无操作退出时间</p></div><el-button type="primary" :icon="Plus" @click="openCreate">新增用户</el-button></div>
    <section class="toolbar-panel session-setting">
      <div class="setting-icon"><el-icon><Timer /></el-icon></div>
      <div><strong>无操作自动退出</strong><p>用户持续操作时会自动续期；停止操作达到设定时间后退出。</p></div>
      <el-input-number v-model="idleTimeoutMinutes" :min="5" :max="480" :step="5" controls-position="right" />
      <span>分钟</span><el-button :loading="savingTimeout" @click="saveTimeout">保存</el-button>
    </section>
    <section class="table-panel"><el-table v-loading="loading" :data="rows" stripe><el-table-column prop="username" label="用户名" min-width="140" /><el-table-column prop="displayName" label="姓名" min-width="120" /><el-table-column label="角色" min-width="130"><template #default="{ row }"><el-tag>{{ ROLE_LABELS[row.role as UserRole] }}</el-tag></template></el-table-column><el-table-column label="状态" min-width="150"><template #default="{ row }"><el-button size="small" :type="row.status === 0 ? 'success' : 'info'" @click="updateStatus(row, row.status !== 0)">{{ row.status === 0 ? "启用，点击停用" : "停用，点击启用" }}</el-button></template></el-table-column><el-table-column label="最近登录" min-width="180"><template #default="{ row }">{{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : "从未登录" }}</template></el-table-column><el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button text type="primary" :icon="Edit" title="编辑用户" @click="openEdit(row)" /></template></el-table-column></el-table></section>
    <el-dialog v-model="visible" :title="title" width="480px" destroy-on-close><el-form label-width="88px" @submit.prevent="save"><el-form-item label="用户名" required><el-input v-model="form.username" :disabled="Boolean(editingId)" autocomplete="off" /></el-form-item><el-form-item label="姓名" required><el-input v-model="form.displayName" /></el-form-item><el-form-item :label="editingId ? '新密码' : '密码'" :required="!editingId"><el-input v-model="form.password" type="password" show-password autocomplete="new-password" /></el-form-item><el-form-item label="角色" required><el-select v-model="form.role" style="width:100%"><el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item><el-form-item v-if="editingId" label="状态"><el-select v-model="form.status" style="width:100%"><el-option label="启用" :value="0" /><el-option label="停用" :value="1" /></el-select></el-form-item></el-form><template #footer><span class="dialog-footer"><el-button @click="visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></span></template></el-dialog>
  </section>
</template>

<style scoped>
.session-setting { display: flex; align-items: center; gap: 12px; padding: 16px; }
.session-setting p { margin: 4px 0 0; color: var(--el-text-color-secondary); font-size: 13px; }
.setting-icon { color: var(--el-color-primary); font-size: 22px; }
.session-setting > :nth-child(2) { flex: 1; }
@media (max-width: 720px) { .session-setting { align-items: flex-start; flex-wrap: wrap; } .session-setting > :nth-child(2) { min-width: calc(100% - 40px); } }
</style>
