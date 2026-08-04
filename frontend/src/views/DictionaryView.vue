<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Edit, Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useAuthStore } from "../stores/auth";
import { api } from "../utils/api";

const auth = useAuthStore();
const categories = ref<any[]>([]);
const selected = ref<any>();
const loading = ref(false);
const keyword = ref("");
const itemDialog = ref(false);
const editingId = ref("");
const itemForm = reactive({
  code: "",
  name: "",
  value: "",
  sortOrder: 0,
  isDefault: false,
  enabled: true,
  remark: "",
});

const isAdmin = computed(() => auth.user?.role === "ADMIN");
const filtered = computed(() => categories.value.filter(row =>
  !keyword.value || `${row.code}${row.description ?? ""}`.toLowerCase().includes(keyword.value.toLowerCase()),
));

async function load() {
  loading.value = true;
  try {
    categories.value = await api.get<any[]>("/dictionary");
    if (categories.value.length && !selected.value) await select(categories.value[0].code);
  } finally {
    loading.value = false;
  }
}

async function select(code: string) {
  selected.value = await api.get<any>(`/dictionary/categories/${code}`);
}

function resetItemForm() {
  editingId.value = "";
  Object.assign(itemForm, {
    code: "",
    name: "",
    value: "",
    sortOrder: 0,
    isDefault: false,
    enabled: true,
    remark: "",
  });
}

function openCreateItem() {
  resetItemForm();
  itemDialog.value = true;
}

function openEditItem(row: any) {
  editingId.value = row.id;
  Object.assign(itemForm, {
    code: row.code,
    name: row.name,
    value: row.value,
    sortOrder: row.sortOrder,
    isDefault: row.isDefault,
    enabled: row.enabled,
    remark: row.remark ?? "",
  });
  itemDialog.value = true;
}

async function saveItem() {
  if (!selected.value) return;
  if (!itemForm.code.trim() || !itemForm.name.trim() || !itemForm.value.trim()) {
    return ElMessage.warning("编码、显示名称和实际值不能为空");
  }
  const payload = {
    name: itemForm.name.trim(),
    value: itemForm.value.trim(),
    sortOrder: Number(itemForm.sortOrder),
    isDefault: itemForm.isDefault,
    enabled: itemForm.enabled,
    remark: itemForm.remark.trim() || null,
  };
  if (editingId.value) {
    await api.put(`/dictionary/items/${editingId.value}`, payload);
  } else {
    await api.post(`/dictionary/${selected.value.code}/items`, {
      code: itemForm.code.trim().toUpperCase(),
      ...payload,
    });
  }
  const categoryCode = selected.value.code;
  itemDialog.value = false;
  await load();
  await select(categoryCode);
  ElMessage.success(editingId.value ? "字典项已更新" : "字典项已新增");
}

async function toggleItem(row: any) {
  await api.put(`/dictionary/items/${row.id}`, { enabled: !row.enabled });
  const categoryCode = selected.value.code;
  await load();
  await select(categoryCode);
}

async function removeItem(row: any) {
  await ElMessageBox.confirm(`删除字典项 ${row.code}？`, "删除字典项", { type: "warning" });
  await api.delete(`/dictionary/items/${row.id}`);
  const categoryCode = selected.value.code;
  await load();
  await select(categoryCode);
}

onMounted(load);
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div><h2>数据字典</h2><p>统一维护业务状态、类型、分类和下拉选项。</p></div>
      <el-tag v-if="!isAdmin" type="info">只读</el-tag>
    </section>

    <section class="dictionary-layout">
      <el-card shadow="never">
        <el-input v-model="keyword" placeholder="搜索分类" class="category-search"/>
        <el-table table-layout="auto"
          v-loading="loading"
          :data="filtered"
          highlight-current-row
          @current-change="(row:any) => row && select(row.code)"
        >
          <el-table-column prop="code" label="分类编码"/>
          <el-table-column prop="description" label="说明"/>
          <el-table-column prop="itemCount" label="项目数"/>
          <el-table-column label="状态">
            <template #default="{row}"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? "启用" : "停用" }}</el-tag></template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="item-header">
            <span>{{ selected?.description ?? selected?.code ?? "字典项" }}</span>
            <el-button v-if="isAdmin && selected" type="primary" :icon="Plus" @click="openCreateItem">新增字典项</el-button>
          </div>
        </template>
        <el-table table-layout="auto" :data="selected?.items ?? []" stripe>
          <el-table-column prop="code" label="编码"/>
          <el-table-column prop="name" label="显示名称"/>
          <el-table-column prop="value" label="实际值"/>
          <el-table-column prop="sortOrder" label="排序"/>
          <el-table-column label="状态">
            <template #default="{row}"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? "启用" : "停用" }}</el-tag></template>
          </el-table-column>
          <el-table-column v-if="isAdmin" label="操作">
            <template #default="{row}">
              <el-button link type="primary" :icon="Edit" @click="openEditItem(row)">编辑</el-button>
              <el-button link @click="toggleItem(row)">{{ row.enabled ? "停用" : "启用" }}</el-button>
              <el-button link type="danger" @click="removeItem(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </section>

    <el-dialog v-model="itemDialog" :title="editingId ? '编辑字典项' : '新增字典项'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="编码" required>
          <el-input v-model="itemForm.code" :disabled="Boolean(editingId)" placeholder="例如 AGENCY_SERVICE"/>
        </el-form-item>
        <el-form-item label="显示名称" required><el-input v-model="itemForm.name" placeholder="例如 代理服务费"/></el-form-item>
        <el-form-item label="实际值" required><el-input v-model="itemForm.value" placeholder="例如 代理服务费"/></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="itemForm.sortOrder" :step="10" controls-position="right"/></el-form-item>
        <el-form-item label="默认项"><el-switch v-model="itemForm.isDefault"/></el-form-item>
        <el-form-item label="启用"><el-switch v-model="itemForm.enabled"/></el-form-item>
        <el-form-item label="备注"><el-input v-model="itemForm.remark" type="textarea" :rows="3"/></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialog = false">取消</el-button>
        <el-button type="primary" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dictionary-layout { display:grid; grid-template-columns:minmax(300px,.9fr) minmax(0,1.5fr); gap:18px; }
.category-search { margin-bottom:12px; }
.item-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
@media (max-width: 900px) { .dictionary-layout { grid-template-columns:1fr; } }
</style>
