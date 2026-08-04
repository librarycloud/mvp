<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api } from "../utils/api";
import { useAuthStore } from "../stores/auth";
const auth = useAuthStore(); const manager = computed(() => auth.canManageAccounting);
const plans = ref<any[]>([]); const mode = ref("SIMPLE"); const dialog = ref(false); const lineDialog = ref(false); const active = ref<any>();
const form = ref({ fiscalYear: new Date().getFullYear(), name: "年度费用预算", lines: [] as any[] }); const line = ref({ expenseType: "", department: "", amount: "" });
async function load() { [plans.value, mode.value] = await Promise.all([api.get<any[]>(`/budgets?fiscalYear=${form.value.fiscalYear}`), api.get<any>("/company-profile").then(x=>x?.operationMode ?? "SIMPLE")]); }
function openPlan() { form.value = { fiscalYear: new Date().getFullYear(), name: "年度费用预算", lines: [] }; dialog.value = true; }
function openLine(plan: any) { active.value = plan; line.value = { expenseType: "", department: "", amount: "" }; lineDialog.value = true; }
async function savePlan() { await api.post("/budgets", form.value); dialog.value = false; await load(); ElMessage.success("预算计划已创建"); }
async function saveLine() { await api.post(`/budgets/${active.value.id}/lines`, line.value); lineDialog.value = false; await load(); ElMessage.success("预算额度已添加"); }
async function removeLine(row: any) { await ElMessageBox.confirm("确认删除此预算额度？", "删除额度"); await api.delete(`/budgets/lines/${row.id}`); await load(); }
onMounted(load);
</script>
<template>
  <div class="page-grid"><section class="page-heading"><div><h2>预算与费用管控</h2><p>报销提交自动占用预算，付款后转实际；当前为{{ mode === 'SIMPLE' ? '简易模式，超额仅提醒' : '标准模式，超额拦截' }}。</p></div><el-button v-if="manager" type="primary" @click="openPlan">新增预算计划</el-button></section><el-card v-for="plan in plans" :key="plan.id" shadow="never"><template #header><div class="report-title"><b>{{ plan.fiscalYear }} · {{ plan.name }}</b><el-button v-if="manager" text type="primary" @click="openLine(plan)">增加额度</el-button></div></template><el-table :data="plan.lines" size="small"><el-table-column prop="expenseType" label="费用类型"/><el-table-column prop="department" label="部门"><template #default="scope">{{ scope.row.department || '通用' }}</template></el-table-column><el-table-column prop="amount" label="预算"/><el-table-column prop="reserved" label="占用"/><el-table-column prop="consumed" label="已用"/><el-table-column prop="available" label="可用"/><el-table-column label="状态"><template #default="scope"><el-tag :type="scope.row.over ? 'danger' : 'success'">{{ scope.row.over ? '已超额' : '正常' }}</el-tag></template></el-table-column><el-table-column v-if="manager" label="操作" width="90"><template #default="scope"><el-button text type="danger" @click="removeLine(scope.row)">删除</el-button></template></el-table-column></el-table></el-card><el-empty v-if="!plans.length" description="暂无预算计划"/></div>
  <el-dialog v-model="dialog" title="新增预算计划" width="520px"><el-form label-width="90px"><el-form-item label="年度"><el-input v-model.number="form.fiscalYear"/></el-form-item><el-form-item label="名称"><el-input v-model="form.name"/></el-form-item></el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="savePlan">保存</el-button></template></el-dialog>
  <el-dialog v-model="lineDialog" title="增加预算额度" width="520px"><el-form label-width="90px"><el-form-item label="费用类型"><el-input v-model="line.expenseType"/></el-form-item><el-form-item label="部门"><el-input v-model="line.department" placeholder="留空表示通用"/></el-form-item><el-form-item label="预算金额"><el-input v-model="line.amount"/></el-form-item></el-form><template #footer><el-button @click="lineDialog=false">取消</el-button><el-button type="primary" @click="saveLine">保存</el-button></template></el-dialog>
</template>
