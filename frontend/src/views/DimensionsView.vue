<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api } from "../utils/api";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore(); const manager = computed(() => auth.canManageAccounting);
const rows = ref<any[]>([]); const accounts = ref<any[]>([]); const loading = ref(false);
const dimensionDialog = ref(false); const memberDialog = ref(false); const ruleDialog = ref(false); const active = ref<any>(); const editingMemberId = ref<number>();
const dimension = ref({ code: "", name: "" }); const member = ref({ code: "", name: "", enabled: true }); const rule = ref({ accountId: "", dimensionId: "", required: true });
async function load() { loading.value = true; try { [rows.value, accounts.value] = await Promise.all([api.get<any[]>("/dimensions"), api.get<any[]>("/accounts?tree=false&isEnabled=true")]); } finally { loading.value = false; } }
function openDimension() { dimension.value = { code: "", name: "" }; dimensionDialog.value = true; }
function openMember(row: any, item?: any) { active.value = row; editingMemberId.value = item?.id; member.value = item ? { code: item.code, name: item.name, enabled: item.enabled } : { code: "", name: "", enabled: true }; memberDialog.value = true; }
function openRule() { rule.value = { accountId: "", dimensionId: "", required: true }; ruleDialog.value = true; }
async function saveDimension() { await api.post("/dimensions", dimension.value); dimensionDialog.value = false; await load(); ElMessage.success("维度已创建"); }
async function saveMember() { if (editingMemberId.value) await api.put(`/dimensions/members/${editingMemberId.value}`, member.value); else await api.post(`/dimensions/${active.value.id}/members`, member.value); memberDialog.value = false; await load(); ElMessage.success(editingMemberId.value ? "成员已更新" : "成员已创建"); }
async function saveRule() { await api.post("/dimensions/rules", { ...rule.value, accountId: Number(rule.value.accountId), dimensionId: Number(rule.value.dimensionId) }); ruleDialog.value = false; await load(); ElMessage.success("规则已保存"); }
async function removeMember() { if (!editingMemberId.value) return; await ElMessageBox.confirm("仅未被凭证使用的成员可以删除，确认继续？", "删除成员"); await api.delete(`/dimensions/members/${editingMemberId.value}`); memberDialog.value = false; await load(); ElMessage.success("成员已删除"); }
async function removeRule(row: any) { await api.delete(`/dimensions/rules/${row.id}`); await load(); ElMessage.success("规则已删除"); }
onMounted(load);
</script>
<template>
  <div class="page-grid">
    <section class="page-heading"><div><h2>结构化辅助核算</h2><p>用维度和成员替代自由文本，凭证、明细账和报表使用同一套核算口径。</p></div><div v-if="manager" class="page-actions"><el-button @click="openRule">设置科目规则</el-button><el-button type="primary" @click="openDimension">新增维度</el-button></div></section>
    <el-card v-loading="loading" shadow="never"><el-table :data="rows" stripe><el-table-column prop="code" label="维度编码" width="160"/><el-table-column prop="name" label="维度名称"/><el-table-column label="成员"><template #default="scope"><el-button v-for="item in scope.row.members" :key="item.id" text class="member-button" :disabled="!manager" @click="openMember(scope.row,item)"><el-tag size="small" :type="item.enabled ? 'primary' : 'info'">{{ item.name }}{{ item.enabled ? '' : '（停用）' }}</el-tag></el-button><el-button v-if="manager" text type="primary" @click="openMember(scope.row)">新增成员</el-button></template></el-table-column><el-table-column label="科目必填规则"><template #default="scope"><el-tag v-for="item in scope.row.accountRules" :key="item.id" size="small" type="warning" class="inline-tag">{{ item.account.code }} {{ item.account.name }}</el-tag></template></el-table-column><el-table-column v-if="manager" label="操作" width="120"><template #default="scope"><el-button text type="primary" @click="openMember(scope.row)">新增成员</el-button></template></el-table-column></el-table></el-card>
    <el-card shadow="never"><template #header><b>使用原则</b></template><div class="muted">维度成员必须启用；同一分录同一维度只能选一个成员；配置为必填的科目在凭证保存时校验。</div></el-card>
  </div>
  <el-dialog v-model="dimensionDialog" title="新增辅助核算维度" width="440px"><el-form label-width="90px"><el-form-item label="编码"><el-input v-model="dimension.code"/></el-form-item><el-form-item label="名称"><el-input v-model="dimension.name"/></el-form-item></el-form><template #footer><el-button @click="dimensionDialog=false">取消</el-button><el-button type="primary" @click="saveDimension">保存</el-button></template></el-dialog>
  <el-dialog v-model="memberDialog" :title="`${editingMemberId ? '编辑' : '新增'}${active?.name ?? ''}成员`" width="440px"><el-form label-width="90px"><el-form-item label="编码"><el-input v-model="member.code"/></el-form-item><el-form-item label="名称"><el-input v-model="member.name"/></el-form-item><el-form-item v-if="editingMemberId" label="启用"><el-switch v-model="member.enabled"/></el-form-item></el-form><template #footer><el-button v-if="editingMemberId" type="danger" plain @click="removeMember">删除</el-button><el-button @click="memberDialog=false">取消</el-button><el-button type="primary" @click="saveMember">保存</el-button></template></el-dialog>
  <el-dialog v-model="ruleDialog" title="设置科目辅助核算" width="520px"><el-form label-width="90px"><el-form-item label="会计科目"><el-select v-model="rule.accountId" filterable style="width:100%"><el-option v-for="item in accounts.filter(x=>x.isLeaf&&x.isEnabled)" :key="item.id" :label="`${item.code} ${item.name}`" :value="item.id"/></el-select></el-form-item><el-form-item label="辅助维度"><el-select v-model="rule.dimensionId" style="width:100%"><el-option v-for="item in rows" :key="item.id" :label="`${item.code} ${item.name}`" :value="item.id"/></el-select></el-form-item><el-form-item label="必填"><el-switch v-model="rule.required"/></el-form-item></el-form><template #footer><el-button @click="ruleDialog=false">取消</el-button><el-button type="primary" @click="saveRule">保存</el-button></template></el-dialog>
</template>
<style scoped>.inline-tag{margin:0 6px 4px 0}.member-button{padding:0;margin:0 6px 4px 0}.muted{color:#667085;font-size:13px}</style>
