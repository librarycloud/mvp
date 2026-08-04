<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api } from "../utils/api";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const isAdmin = computed(() => auth.user?.role === "ADMIN");
const rows = ref<any[]>([]); const loading = ref(false); const visible = ref(false);
const form = reactive({ buyerName: "", buyerIdNum: "", invoiceType: "ORDINARY", amountWithoutTax: "", taxAmount: "", remark: "" });
const statusLabels: Record<number, string> = { 0: "待审批", 1: "待开具", 2: "已驳回", 3: "已开具" };
const statusTypes: Record<number, "info" | "warning" | "danger" | "success"> = { 0: "info", 1: "warning", 2: "danger", 3: "success" };
async function load() { loading.value = true; try { rows.value = await api.get("/invoices/sales-requests"); } finally { loading.value = false; } }
function open() { Object.assign(form, { buyerName: "", buyerIdNum: "", invoiceType: "ORDINARY", amountWithoutTax: "", taxAmount: "", remark: "" }); visible.value = true; }
async function submit() { await api.post("/invoices/sales-requests", form); visible.value = false; ElMessage.success("开票申请已提交"); await load(); }
async function approve(row: any) { await api.post(`/invoices/sales-requests/${row.id}/approve`); await load(); }
async function reject(row: any) { const result = await ElMessageBox.prompt("填写驳回原因", "驳回开票申请", { inputPattern: /\S+/, inputErrorMessage: "原因不能为空" }); await api.post(`/invoices/sales-requests/${row.id}/reject`, { reason: result.value }); await load(); }
async function issue(row: any) { const result = await ElMessageBox.prompt("输入已归档销项发票的记录编号", "登记发票开具", { inputPattern: /^\d+$/, inputErrorMessage: "请输入发票记录编号" }); await api.post(`/invoices/sales-requests/${row.id}/issue`, { invoiceId: Number(result.value) }); await load(); }
onMounted(load);
</script>

<template>
  <div class="page-grid"><section class="page-heading"><div><h2>销项开票申请</h2><p>提交客户开票需求，审批后关联已归档的销项电子发票。</p></div><el-button type="primary" @click="open">新增申请</el-button></section><el-card shadow="never"><el-table v-loading="loading" :data="rows" stripe><el-table-column prop="requestNo" label="申请单号" min-width="170"/><el-table-column prop="buyerName" label="购方名称" min-width="180"/><el-table-column prop="buyerIdNum" label="购方税号" min-width="180"/><el-table-column prop="amountIncludingTax" label="价税合计" align="right"/><el-table-column label="状态" width="110"><template #default="{row}"><el-tag :type="statusTypes[row.status]">{{statusLabels[row.status]}}</el-tag></template></el-table-column><el-table-column prop="issuedInvoiceId" label="已开具发票" width="120"/><el-table-column label="操作" width="190"><template #default="{row}"><el-button v-if="isAdmin && row.status === 0" link type="primary" @click="approve(row)">审批</el-button><el-button v-if="isAdmin && row.status === 0" link type="danger" @click="reject(row)">驳回</el-button><el-button v-if="isAdmin && row.status === 1" link type="primary" @click="issue(row)">登记开具</el-button></template></el-table-column></el-table></el-card><el-dialog v-model="visible" title="新增销项开票申请" width="560px"><el-form label-width="100px"><el-form-item label="购方名称" required><el-input v-model="form.buyerName"/></el-form-item><el-form-item label="购方税号" required><el-input v-model="form.buyerIdNum"/></el-form-item><el-form-item label="发票类型"><el-select v-model="form.invoiceType" style="width:100%"><el-option label="增值税专用发票" value="SPECIAL"/><el-option label="普通发票" value="ORDINARY"/></el-select></el-form-item><el-form-item label="不含税金额" required><el-input v-model="form.amountWithoutTax"/></el-form-item><el-form-item label="税额" required><el-input v-model="form.taxAmount"/></el-form-item><el-form-item label="备注"><el-input v-model="form.remark" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="visible=false">取消</el-button><el-button type="primary" :disabled="!form.buyerName || !form.buyerIdNum || !form.amountWithoutTax" @click="submit">提交</el-button></template></el-dialog></div>
</template>
