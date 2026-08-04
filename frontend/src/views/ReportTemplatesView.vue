<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { api } from "../utils/api";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const isAdmin = computed(() => auth.user?.role === "ADMIN");
const templates = ref<any[]>([]); const accounts = ref<any[]>([]); const active = ref<any>(); const loading = ref(false);
const editorVisible = ref(false); const itemVisible = ref(false); const editingIndex = ref(-1); const createMode = ref(false);
const draft = reactive<any>({ code: "", type: "CUSTOM", name: "", description: "", items: [] });
const item = reactive<any>({ itemCode: "", name: "", lineNumber: null, sortOrder: 1, normalDirection: null, valueType: null, isSubtotal: false, displayLevel: 1, mappings: [], dependencies: [] });
const typeLabels: Record<string, string> = { BALANCE_SHEET: "资产负债表", INCOME_STATEMENT: "利润表", CASH_FLOW_STATEMENT: "现金流量表", EQUITY_CHANGE_STATEMENT: "所有者权益变动表", CUSTOM: "自定义报表" };
const valueTypes = ["OPENING_BALANCE", "CLOSING_BALANCE", "PERIOD_DEBIT", "PERIOD_CREDIT", "PERIOD_NET", "YEAR_TO_DATE_DEBIT", "YEAR_TO_DATE_CREDIT", "YEAR_TO_DATE_NET", "CASH_INFLOW", "CASH_OUTFLOW"];
const valueLabels: Record<string, string> = { OPENING_BALANCE: "期初余额", CLOSING_BALANCE: "期末余额", PERIOD_DEBIT: "本期借方", PERIOD_CREDIT: "本期贷方", PERIOD_NET: "本期净额", YEAR_TO_DATE_DEBIT: "本年借方", YEAR_TO_DATE_CREDIT: "本年贷方", YEAR_TO_DATE_NET: "本年净额", CASH_INFLOW: "现金流入（按对方科目）", CASH_OUTFLOW: "现金流出（按对方科目）" };
const itemCodeOptions = computed(() => draft.items.map((row:any) => ({ code: row.itemCode, name: row.name })).filter((row:any) => row.code !== item.itemCode));

async function load() { loading.value = true; try { templates.value = await api.get<any[]>("/report-templates"); } finally { loading.value = false; } }
async function select(row:any) { active.value = await api.get(`/report-templates/${row.id}`); }
function emptyItem() { return { itemCode: "", name: "", lineNumber: null, sortOrder: draft.items.length + 1, normalDirection: null, valueType: null, isSubtotal: false, displayLevel: 1, mappings: [], dependencies: [] }; }
function openCreate() { createMode.value = true; Object.assign(draft, { code: "", type: "CUSTOM", name: "", description: "", items: [] }); draft.items.push(emptyItem()); editorVisible.value = true; }
function openPublish() {
  if (!active.value) return;
  createMode.value = false;
  Object.assign(draft, {
    code: active.value.code, type: active.value.type, name: active.value.name, description: active.value.description ?? "",
    items: active.value.items.map((row:any) => ({ itemCode: row.itemCode, name: row.name, lineNumber: row.lineNumber, sortOrder: row.sortOrder, normalDirection: row.normalDirection, valueType: row.valueType, isSubtotal: row.isSubtotal, displayLevel: row.displayLevel, mappings: row.accountMappings.map((mapping:any) => ({ accountId: mapping.accountId, operator: mapping.operator, valueType: mapping.valueType, direction: mapping.direction, includeChildren: mapping.includeChildren })), dependencies: row.dependenciesAsTarget.map((dependency:any) => ({ sourceItemCode: dependency.sourceItem.itemCode, operator: dependency.operator, coefficient: dependency.coefficient })) })),
  });
  editorVisible.value = true;
}
function editItem(index:number) { editingIndex.value = index; Object.assign(item, structuredClone(draft.items[index])); itemVisible.value = true; }
function addItem() { editingIndex.value = -1; Object.assign(item, emptyItem()); itemVisible.value = true; }
function saveItem() {
  if (!item.itemCode.trim() || !item.name.trim()) return ElMessage.warning("请填写项目编码和名称");
  const value = structuredClone(item);
  if (editingIndex.value >= 0) draft.items[editingIndex.value] = value; else draft.items.push(value);
  itemVisible.value = false;
}
function removeItem(index:number) { draft.items.splice(index, 1); }
function addMapping() { item.mappings.push({ accountId: "", operator: "ADD", valueType: "CLOSING_BALANCE", direction: null, includeChildren: true }); }
function addDependency() { item.dependencies.push({ sourceItemCode: "", operator: "ADD", coefficient: "1" }); }
async function publish() {
  const body = { name: draft.name, description: draft.description || null, items: draft.items };
  if (createMode.value) await api.post("/report-templates", { code: draft.code, type: draft.type, ...body });
  else await api.post(`/report-templates/${active.value.id}/versions`, body);
  editorVisible.value = false; active.value = undefined; await load(); ElMessage.success(createMode.value ? "模板已创建" : "新版本已发布");
}
async function toggle(row:any) { await api.post(`/report-templates/${row.id}/${row.isActive ? "deactivate" : "activate"}`); await load(); if (active.value?.id === row.id) await select(row); }
onMounted(async () => { await Promise.all([load(), api.get<any[]>("/accounts?tree=false").then((rows) => accounts.value = rows)]); });
</script>

<template><div class="page-grid">
  <section class="page-heading"><div><h2>报表模板</h2><p>通过版本化配置维护报表项目、科目映射和计算依赖。</p></div><el-button v-if="isAdmin" type="primary" @click="openCreate">新建模板</el-button></section>
  <div class="template-layout">
    <el-card shadow="never"><el-table v-loading="loading" :data="templates" highlight-current-row @current-change="select"><el-table-column prop="code" label="模板编码" min-width="200"/><el-table-column prop="name" label="名称" min-width="220"/><el-table-column label="类型"><template #default="{row}">{{typeLabels[row.type]}}</template></el-table-column><el-table-column prop="version" label="版本" width="70"/><el-table-column label="状态" width="90"><template #default="{row}"><el-tag :type="row.isActive?'success':'info'">{{row.isActive?'启用':'停用'}}</el-tag></template></el-table-column><el-table-column v-if="isAdmin" label="操作" width="90"><template #default="{row}"><el-button link @click.stop="toggle(row)">{{row.isActive?'停用':'启用'}}</el-button></template></el-table-column></el-table></el-card>
    <el-card v-if="active" shadow="never"><template #header><div class="detail-head"><b>{{active.name}} V{{active.version}}</b><el-button v-if="isAdmin" type="primary" @click="openPublish">编辑并发布新版本</el-button></div></template><el-table :data="active.items"><el-table-column prop="sortOrder" label="排序" width="65"/><el-table-column prop="itemCode" label="项目编码" min-width="130"/><el-table-column prop="name" label="项目名称" min-width="180"/><el-table-column label="科目映射" min-width="210"><template #default="{row}"><span v-for="mapping in row.accountMappings" :key="mapping.id" class="mapping-tag">{{mapping.account.code}} {{mapping.account.name}}</span></template></el-table-column><el-table-column label="公式依赖" min-width="180"><template #default="{row}">{{row.dependenciesAsTarget.map((dependency:any)=>`${dependency.operator==='ADD'?'+':'-'}${dependency.sourceItem.itemCode}×${dependency.coefficient}`).join(' ')||'-'}}</template></el-table-column></el-table></el-card>
  </div>

  <el-dialog v-model="editorVisible" :title="createMode?'新建报表模板':`发布 ${draft.code} 新版本`" width="88%" top="5vh"><el-form label-width="90px"><div class="form-grid"><el-form-item v-if="createMode" label="模板编码"><el-input v-model="draft.code" placeholder="例如 MANAGEMENT_REPORT"/></el-form-item><el-form-item v-if="createMode" label="报表类型"><el-select v-model="draft.type" style="width:100%"><el-option v-for="(label,key) in typeLabels" :key="key" :label="label" :value="key"/></el-select></el-form-item><el-form-item label="模板名称"><el-input v-model="draft.name"/></el-form-item><el-form-item label="说明"><el-input v-model="draft.description"/></el-form-item></div></el-form><div class="detail-head"><b>报表项目</b><el-button @click="addItem">增加项目</el-button></div><el-table :data="draft.items" max-height="430"><el-table-column prop="sortOrder" label="排序"/><el-table-column prop="itemCode" label="编码"/><el-table-column prop="name" label="名称"/><el-table-column label="映射"><template #default="{row}">{{row.mappings.length}}</template></el-table-column><el-table-column label="依赖"><template #default="{row}">{{row.dependencies.length}}</template></el-table-column><el-table-column label="操作"><template #default="{row,$index}"><el-button link @click="editItem($index)">编辑</el-button><el-button link type="danger" @click="removeItem($index)">删除</el-button></template></el-table-column></el-table><template #footer><el-button @click="editorVisible=false">取消</el-button><el-button type="primary" :disabled="!draft.name||!draft.items.length" @click="publish">发布并启用</el-button></template></el-dialog>

  <el-dialog v-model="itemVisible" title="报表项目" width="760px" top="5vh"><el-form label-width="90px"><div class="form-grid"><el-form-item label="项目编码"><el-input v-model="item.itemCode"/></el-form-item><el-form-item label="项目名称"><el-input v-model="item.name"/></el-form-item><el-form-item label="行次"><el-input-number v-model="item.lineNumber" :min="1"/></el-form-item><el-form-item label="排序"><el-input-number v-model="item.sortOrder" :min="1"/></el-form-item></div></el-form><div class="detail-head"><b>科目映射</b><el-button @click="addMapping">增加映射</el-button></div><div v-for="(mapping,index) in item.mappings" :key="index" class="mapping-row"><el-select v-model="mapping.accountId" filterable placeholder="会计科目"><el-option v-for="account in accounts" :key="account.id" :label="`${account.code} ${account.name}`" :value="account.id"/></el-select><el-select v-model="mapping.operator"><el-option label="加" value="ADD"/><el-option label="减" value="SUBTRACT"/></el-select><el-select v-model="mapping.valueType"><el-option v-for="value in valueTypes" :key="value" :label="valueLabels[value]" :value="value"/></el-select><el-select v-model="mapping.direction" clearable placeholder="余额方向"><el-option label="借" value="DEBIT"/><el-option label="贷" value="CREDIT"/></el-select><el-checkbox v-model="mapping.includeChildren">含下级</el-checkbox><el-button link type="danger" @click="item.mappings.splice(index,1)">删除</el-button></div><div class="detail-head dependency-head"><b>公式依赖</b><el-button @click="addDependency">增加依赖</el-button></div><div v-for="(dependency,index) in item.dependencies" :key="index" class="dependency-row"><el-select v-model="dependency.sourceItemCode" filterable placeholder="来源项目"><el-option v-for="source in itemCodeOptions" :key="source.code" :label="`${source.code} ${source.name}`" :value="source.code"/></el-select><el-select v-model="dependency.operator"><el-option label="加" value="ADD"/><el-option label="减" value="SUBTRACT"/></el-select><el-input v-model="dependency.coefficient" placeholder="系数"/><el-button link type="danger" @click="item.dependencies.splice(index,1)">删除</el-button></div><template #footer><el-button @click="itemVisible=false">取消</el-button><el-button type="primary" @click="saveItem">保存项目</el-button></template></el-dialog>
</div></template>

<style scoped>
.template-layout{display:grid;gap:18px}.detail-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.mapping-tag{display:block}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.mapping-row{display:grid;grid-template-columns:2fr .8fr 1.4fr 1fr auto auto;gap:8px;align-items:center;margin-bottom:8px}.dependency-row{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:8px}.dependency-head{margin-top:22px}@media(max-width:900px){.form-grid{grid-template-columns:1fr}.mapping-row,.dependency-row{grid-template-columns:1fr}}
</style>
