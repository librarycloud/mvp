<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { api } from "../utils/api";
import { formatOperationTime } from "../utils/date";

interface Period {
  id: number; year: number; month: number; periodCode: string; startDate: string; endDate: string;
  status: number; closedAt: string | null; closedBy: { displayName: string } | null;
}

const PERIOD_STATUS = { OPEN: 0, CLOSED: 1, LOCKED: 2 } as const;
const periodLabels: Record<number, string> = { 0: "\u6253\u5f00", 1: "\u5df2\u5173\u8d26", 2: "\u5df2\u9501\u5b9a" };
const router = useRouter();
const auth = useAuthStore();
const rows = ref<Period[]>([]); const loading = ref(false); const visible = ref(false);
const checklistVisible = ref(false); const checklist = ref<any>({ ready: false, checks: [] }); const checklistPeriod = ref<Period>();
const form = reactive({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
const editVisible = ref(false); const editingId = ref<number | "">("");
const editForm = reactive({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, startDate: "", endDate: "" });
const isAdmin = computed(() => auth.canManageAccounting);

async function load() { loading.value = true; try { rows.value = await api.get<Period[]>('/accounting-periods'); } finally { loading.value = false; } }
async function create() { await api.post('/accounting-periods', form); visible.value = false; ElMessage.success('会计期间已创建'); await load(); }
function openEdit(row: Period) {
  editingId.value = row.id;
  Object.assign(editForm, { year: row.year, month: row.month, startDate: date(row.startDate), endDate: date(row.endDate) });
  editVisible.value = true;
}
async function updatePeriod() {
  await api.put(`/accounting-periods/${editingId.value}`, editForm);
  editVisible.value = false;
  ElMessage.success('会计期间已修改');
  await load();
}
async function closePeriod(row: Period) {
  await inspect(row);
  if (!checklist.value.ready) return ElMessage.warning('月结检查存在阻断项，请先处理');
  await ElMessageBox.confirm(`确认关闭 ${row.periodCode}？关闭后该期间凭证不能再新增、修改、删除或审核。`, '月末关账', { type: 'warning' });
  await api.post(`/accounting-periods/${row.id}/close`); checklistVisible.value = false; ElMessage.success('已关账'); await load();
}
async function inspect(row: Period) { checklistPeriod.value = row; checklist.value = await api.get(`/accounting-periods/${row.id}/close-checklist`); checklistVisible.value = true; }
async function reopen(row: Period) {
  await ElMessageBox.confirm(`确认反关账 ${row.periodCode}？`, '反关账', { type: 'warning' });
  await api.post(`/accounting-periods/${row.id}/reopen`); ElMessage.success('已反关账'); await load();
}
function date(value: string | null) { return value ? value.slice(0, 10) : '-'; }
function handleCheckRoute(path: string) {
  checklistVisible.value = false;
  router.push(path);
}
onMounted(load);
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div><h2>会计期间</h2><p>维护月度期间并执行月末关账控制。</p></div>
      <div v-if="isAdmin" class="toolbar"><el-button type="primary" @click="visible = true">创建期间</el-button></div>
    </section>
    <el-card shadow="never">
      <el-table table-layout="auto" v-loading="loading" :data="rows" stripe>
        <el-table-column prop="periodCode" label="期间" />
        <el-table-column label="开始日期"><template #default="{ row }">{{ date(row.startDate) }}</template></el-table-column>
        <el-table-column label="结束日期"><template #default="{ row }">{{ date(row.endDate) }}</template></el-table-column>
        <el-table-column label="状态"><template #default="{ row }"><el-tag :type="row.status === PERIOD_STATUS.OPEN ? 'success' : row.status === PERIOD_STATUS.LOCKED ? 'danger' : 'info'">{{ periodLabels[row.status] ?? row.status }}</el-tag></template></el-table-column>
        <el-table-column label="关账人"><template #default="{ row }">{{ row.closedBy?.displayName ?? '-' }}</template></el-table-column>
        <el-table-column label="关账时间"><template #default="{ row }">{{ formatOperationTime(row.closedAt) }}</template></el-table-column>
        <el-table-column v-if="isAdmin" label="操作"><template #default="{ row }"><el-button v-if="row.status === PERIOD_STATUS.OPEN" link type="primary" @click="openEdit(row)">编辑</el-button><el-button v-if="row.status === PERIOD_STATUS.OPEN" link @click="inspect(row)">月结检查</el-button><el-button v-if="row.status === PERIOD_STATUS.OPEN" link type="danger" @click="closePeriod(row)">关账</el-button><el-button v-else-if="row.status === PERIOD_STATUS.CLOSED" link type="primary" @click="reopen(row)">反关账</el-button></template></el-table-column>
      </el-table>
    </el-card>
    <el-dialog v-model="visible" title="创建会计期间" width="360px">
      <el-form label-width="70px"><el-form-item label="年度"><el-input-number v-model="form.year" :min="2000" :max="9999" /></el-form-item><el-form-item label="月份"><el-select v-model="form.month"><el-option v-for="n in 12" :key="n" :value="n" :label="`${n}月`" /></el-select></el-form-item></el-form>
      <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" @click="create">创建</el-button></template>
    </el-dialog>
    <el-dialog v-model="editVisible" title="修改会计期间" width="460px">
      <el-form label-width="90px">
        <el-form-item label="年度"><el-input-number v-model="editForm.year" :min="2000" :max="9999" /></el-form-item>
        <el-form-item label="月份"><el-select v-model="editForm.month"><el-option v-for="n in 12" :key="n" :value="n" :label="`${n}月`" /></el-select></el-form-item>
        <el-form-item label="开始日期"><el-date-picker v-model="editForm.startDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="结束日期"><el-date-picker v-model="editForm.endDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="期间编号与日期范围相互独立，可设置跨月范围；日期范围不能与其他期间重叠。" />
      <template #footer><el-button @click="editVisible = false">取消</el-button><el-button type="primary" :disabled="!editForm.startDate || !editForm.endDate" @click="updatePeriod">保存</el-button></template>
    </el-dialog>
    <el-drawer v-model="checklistVisible" :title="`${checklistPeriod?.periodCode ?? ''} 月结检查`" size="580px"><el-alert :type="checklist.ready?'success':'error'" :title="checklist.ready?'可以关账':'存在阻断项，暂不能关账'" :closable="false"/><el-table :data="checklist.checks" class="close-checks"><el-table-column prop="name" label="检查项目"/><el-table-column label="结果" width="90"><template #default="{row}"><el-tag :type="row.level==='PASS'?'success':row.level==='WARN'?'warning':'danger'">{{row.level==='PASS'?'通过':row.level==='WARN'?'提醒':'阻断'}}</el-tag></template></el-table-column><el-table-column prop="message" label="说明"/><el-table-column label="操作" width="90"><template #default="{row}"><el-button v-if="row.route&&row.level!=='PASS'" link type="primary" @click="handleCheckRoute(row.route)">处理 →</el-button></template></el-table-column></el-table><template #footer><el-button v-if="checklistPeriod" @click="inspect(checklistPeriod)">重新检查</el-button><el-button v-if="checklist.ready&&checklistPeriod" type="primary" @click="closePeriod(checklistPeriod)">确认关账</el-button></template></el-drawer>
  </div>
</template>
