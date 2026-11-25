<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { api } from "../utils/api";
import { useAuthStore } from "../stores/auth";

type AccountCategory = "ASSET" | "LIABILITY" | "COMMON" | "EQUITY" | "COST" | "PROFIT_AND_LOSS";
type NormalDirection = "DEBIT" | "CREDIT";

interface AccountNode {
  id: number;
  code: string;
  name: string;
  category: AccountCategory;
  normalDirection: NormalDirection;
  parentId: number | null;
  level: number;
  isLeaf: boolean;
  isEnabled: boolean;
  isSystem: boolean;
  cashFlowCode?: string | null;
  sortOrder?: number;
  children?: AccountNode[];
}

const auth = useAuthStore();
const isAdmin = computed(() => auth.isSystemAdmin);
const loading = ref(false);
const saving = ref(false);
const accounts = ref<AccountNode[]>([]);
const keyword = ref("");
const activeCategory = ref<string>("ALL");

const categoryLabels: Record<AccountCategory, string> = {
  ASSET: "资产",
  LIABILITY: "负债",
  COMMON: "共同",
  EQUITY: "所有者权益",
  COST: "成本",
  PROFIT_AND_LOSS: "损益",
};
const directionLabels: Record<NormalDirection, string> = {
  DEBIT: "借",
  CREDIT: "贷",
};

const filteredAccounts = computed(() => {
  if (activeCategory.value === "ALL") return accounts.value;
  return accounts.value.filter((item) => item.category === activeCategory.value);
});

const dialogVisible = ref(false);
const editingRow = ref<AccountNode | null>(null);
const parentRow = ref<AccountNode | null>(null);
const form = reactive({
  code: "",
  name: "",
  category: "ASSET" as AccountCategory,
  normalDirection: "DEBIT" as NormalDirection,
  parentId: null as number | null,
  isEnabled: true,
  sortOrder: 0,
  cashFlowCode: "",
});

async function load() {
  loading.value = true;
  try {
    const q = keyword.value.trim() ? `&keyword=${encodeURIComponent(keyword.value.trim())}` : "";
    accounts.value = await api.get<AccountNode[]>(`/accounts?tree=true${q}`);
  } finally {
    loading.value = false;
  }
}

function suggestChildCode(parent: AccountNode): string {
  const existing = (parent.children ?? []).map((c) => c.code);
  for (let i = 1; i <= 99; i++) {
    const candidate = `${parent.code}${String(i).padStart(2, "0")}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${parent.code}01`;
}

function openCreate(parent?: AccountNode) {
  editingRow.value = null;
  parentRow.value = parent ?? null;
  Object.assign(form, {
    code: parent ? suggestChildCode(parent) : "",
    name: "",
    category: parent ? parent.category : (activeCategory.value !== "ALL" ? (activeCategory.value as AccountCategory) : "ASSET"),
    normalDirection: parent ? parent.normalDirection : "DEBIT",
    parentId: parent ? parent.id : null,
    isEnabled: true,
    sortOrder: 0,
    cashFlowCode: "",
  });
  dialogVisible.value = true;
}

function openEdit(row: AccountNode) {
  editingRow.value = row;
  parentRow.value = null;
  Object.assign(form, {
    code: row.code,
    name: row.name,
    category: row.category,
    normalDirection: row.normalDirection,
    parentId: row.parentId,
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder ?? 0,
    cashFlowCode: row.cashFlowCode ?? "",
  });
  dialogVisible.value = true;
}

async function save() {
  if (saving.value) return;
  if (!/^\d{4,20}$/.test(form.code.trim())) {
    ElMessage.warning("科目编码必须为 4 到 20 位数字");
    return;
  }
  if (!form.name.trim()) {
    ElMessage.warning("请输入科目名称");
    return;
  }
  saving.value = true;
  try {
    if (editingRow.value) {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        isEnabled: form.isEnabled,
        sortOrder: Number(form.sortOrder) || 0,
        cashFlowCode: form.cashFlowCode.trim() || null,
      };
      if (!editingRow.value.isSystem) {
        payload.code = form.code.trim();
        payload.category = form.category;
        payload.normalDirection = form.normalDirection;
      }
      await api.put(`/accounts/${editingRow.value.id}`, payload);
      ElMessage.success("会计科目已更新");
    } else {
      await api.post("/accounts", {
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category,
        normalDirection: form.normalDirection,
        parentId: form.parentId,
        sortOrder: Number(form.sortOrder) || 0,
        cashFlowCode: form.cashFlowCode.trim() || null,
      });
      ElMessage.success("会计科目已创建");
    }
    dialogVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(row: AccountNode) {
  await api.put(`/accounts/${row.id}`, { isEnabled: !row.isEnabled });
  ElMessage.success(row.isEnabled ? "科目已停用" : "科目已启用");
  await load();
}

async function removeAccount(row: AccountNode) {
  try {
    await ElMessageBox.confirm(`确认删除自定义科目「${row.code} ${row.name}」？`, "删除会计科目", {
      type: "warning",
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  await api.delete(`/accounts/${row.id}`);
  ElMessage.success("会计科目已删除");
  await load();
}

onMounted(load);
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div>
        <h2>会计科目</h2>
        <p>维护树形科目和可过账明细科目，支持新增二级/三级子科目与启停管理。</p>
      </div>
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="编码或名称"
          clearable
          style="width: 200px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-button type="primary" plain @click="load">查询</el-button>
        <el-button v-if="isAdmin" type="primary" @click="openCreate()">新增一级科目</el-button>
      </div>
    </section>

    <el-card shadow="never">
      <el-tabs v-model="activeCategory">
        <el-tab-pane label="全部科目" name="ALL" />
        <el-tab-pane label="资产" name="ASSET" />
        <el-tab-pane label="负债" name="LIABILITY" />
        <el-tab-pane label="共同" name="COMMON" />
        <el-tab-pane label="所有者权益" name="EQUITY" />
        <el-tab-pane label="成本" name="COST" />
        <el-tab-pane label="损益" name="PROFIT_AND_LOSS" />
      </el-tabs>

      <el-table
        v-loading="loading"
        :data="filteredAccounts"
        row-key="id"
        :tree-props="{ children: 'children' }"
        default-expand-all
        border
        stripe
        table-layout="auto"
      >
        <el-table-column prop="code" label="科目编码" min-width="150" />
        <el-table-column prop="name" label="科目名称" min-width="220" />
        <el-table-column label="类别" width="110" align="center">
          <template #default="{ row }">{{ categoryLabels[row.category as AccountCategory] ?? row.category }}</template>
        </el-table-column>
        <el-table-column label="方向" width="70" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.normalDirection === 'DEBIT' ? 'primary' : 'warning'">
              {{ directionLabels[row.normalDirection as NormalDirection] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="属性" width="140" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.isSystem" size="small" type="info" style="margin-right: 4px">内置</el-tag>
            <el-tag size="small" :type="row.isLeaf ? 'success' : 'info'">{{ row.isLeaf ? "末级" : "汇总" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="85" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.isEnabled ? 'success' : 'danger'">{{ row.isEnabled ? "启用" : "停用" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.isEnabled" link type="primary" @click="openCreate(row)">新增下级</el-button>
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link :type="row.isEnabled ? 'warning' : 'success'" @click="toggleEnabled(row)">
              {{ row.isEnabled ? "停用" : "启用" }}
            </el-button>
            <el-button
              v-if="!row.isSystem && (!row.children || !row.children.length)"
              link
              type="danger"
              @click="removeAccount(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingRow ? `编辑科目：${editingRow.code}` : parentRow ? `新增「${parentRow.code} ${parentRow.name}」下级科目` : '新增一级科目'"
      width="500px"
    >
      <el-form label-width="100px">
        <el-alert
          v-if="parentRow"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 14px"
          :title="`下级科目编码需以 ${parentRow.code} 开头，类别与余额方向自动继承上级`"
        />
        <el-alert
          v-if="editingRow?.isSystem"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 14px"
          title="系统内置科目的编码、类别和余额方向受保护不可修改"
        />
        <el-form-item label="科目编码" required>
          <el-input v-model="form.code" :disabled="Boolean(editingRow?.isSystem)" placeholder="4-20位纯数字，如 100201" />
        </el-form-item>
        <el-form-item label="科目名称" required>
          <el-input v-model="form.name" placeholder="如：招商银行基本户" />
        </el-form-item>
        <el-form-item label="科目类别">
          <el-select v-model="form.category" :disabled="Boolean(parentRow || editingRow?.isSystem)" style="width: 100%">
            <el-option v-for="(label, key) in categoryLabels" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="余额方向">
          <el-radio-group v-model="form.normalDirection" :disabled="Boolean(parentRow || editingRow?.isSystem)">
            <el-radio value="DEBIT">借方</el-radio>
            <el-radio value="CREDIT">贷方</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="editingRow" label="状态">
          <el-switch v-model="form.isEnabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item label="排序权重">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
