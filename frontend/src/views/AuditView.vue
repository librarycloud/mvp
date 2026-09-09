<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api } from "../utils/api";

const loading = ref(false);
const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);
const action = ref("");
const resourceType = ref("");
const requestId = ref("");
const detail = ref<any>();
const visible = ref(false);
const actions = ["LOGIN", "IMPORT", "CREATE", "UPDATE", "DELETE", "REVIEW", "UNREVIEW", "EXPORT"];
const query = computed(() => {
  const value = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) });
  if (action.value) value.set("action", action.value);
  if (resourceType.value.trim()) value.set("resourceType", resourceType.value.trim());
  if (requestId.value.trim()) value.set("requestId", requestId.value.trim());
  return value;
});

async function load(reset = false) {
  if (reset) page.value = 1;
  loading.value = true;
  try {
    const result = await api.get<any>(`/audits?${query.value}`);
    rows.value = result.items; total.value = result.total;
  } finally { loading.value = false; }
}
function inspect(row: any) { detail.value = row; visible.value = true; }
function json(value: unknown) { return value ? JSON.stringify(value, null, 2) : "-"; }
function download() { return api.download(`/audits/export.csv?${query.value}`, "audit-logs.csv"); }

const archiveVisible = ref(false);
const archiveYear = ref(new Date().getFullYear());
const archiveLoading = ref(false);
const archivePreview = ref<any>(null);

async function inspectArchive() {
  archiveLoading.value = true;
  try {
    archivePreview.value = await api.get<any>(`/audits/export-archive?fiscalYear=${archiveYear.value}`);
  } finally {
    archiveLoading.value = false;
  }
}

function openArchiveModal() {
  archiveVisible.value = true;
  archivePreview.value = null;
  inspectArchive();
}

function downloadArchive() {
  return api.download(`/audits/export-archive?fiscalYear=${archiveYear.value}&download=true`, `GB-T-24589-archive-${archiveYear.value}.json`);
}

onMounted(load);
</script>

<template>
  <div class="page-grid">
    <section class="page-heading">
      <div>
        <h2>审计中心</h2>
        <p>查看关键业务操作、数据变更与请求链路。支持国家标准电子凭证档案导出。</p>
      </div>
      <div style="display: flex; gap: 8px;">
        <el-button @click="download">导出 CSV</el-button>
        <el-button type="warning" plain @click="openArchiveModal">国标档案归档 (GB/T 24589)</el-button>
      </div>
    </section>
    <el-card shadow="never"><div class="toolbar"><el-select v-model="action" clearable placeholder="全部动作" style="width:150px" @change="load(true)"><el-option v-for="item in actions" :key="item" :label="item" :value="item"/></el-select><el-input v-model="resourceType" clearable placeholder="业务对象，如 Invoice" style="width:190px" @keyup.enter="load(true)"/><el-input v-model="requestId" clearable placeholder="请求编号" style="width:190px" @keyup.enter="load(true)"/><el-button type="primary" @click="load(true)">查询</el-button></div></el-card>
    <el-card shadow="never"><el-table v-loading="loading" :data="rows" stripe @row-dblclick="inspect"><el-table-column label="时间" width="180"><template #default="{row}">{{new Date(row.createdAt).toLocaleString()}}</template></el-table-column><el-table-column label="人员" min-width="120"><template #default="{row}">{{row.actor?.displayName ?? row.actor?.username ?? '系统'}}</template></el-table-column><el-table-column prop="action" label="动作" width="100"/><el-table-column prop="resourceType" label="对象" min-width="150"/><el-table-column prop="resourceId" label="编号" width="85"/><el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip/><el-table-column label="详情" width="80"><template #default="{row}"><el-button link type="primary" @click="inspect(row)">查看</el-button></template></el-table-column></el-table><div class="pagination"><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total, sizes, prev, pager, next" @change="load()"/></div></el-card>
    <el-drawer v-model="visible" title="审计详情" size="620px"><template v-if="detail"><el-descriptions :column="1" border><el-descriptions-item label="时间">{{new Date(detail.createdAt).toLocaleString()}}</el-descriptions-item><el-descriptions-item label="操作人">{{detail.actor?.displayName ?? detail.actor?.username ?? '系统'}}</el-descriptions-item><el-descriptions-item label="对象">{{detail.resourceType}} #{{detail.resourceId ?? '-'}}</el-descriptions-item><el-descriptions-item label="动作">{{detail.action}}</el-descriptions-item><el-descriptions-item label="请求编号">{{detail.requestId ?? '-'}}</el-descriptions-item><el-descriptions-item label="IP">{{detail.ipAddress ?? '-'}}</el-descriptions-item><el-descriptions-item label="说明">{{detail.description ?? '-'}}</el-descriptions-item></el-descriptions><h3>变更前</h3><pre>{{json(detail.beforeData)}}</pre><h3>变更后</h3><pre>{{json(detail.afterData)}}</pre></template></el-drawer>

    <!-- GB/T 24589 电子会计档案导出对话框 -->
    <el-dialog v-model="archiveVisible" title="国家标准电子会计档案导出 (GB/T 24589-2010)" width="680px">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
        依照《GB/T 24589-2010 财经信息技术 会计核算软件数据接口》标准，生成包含企业账套信息、会计期间、会计科目表与全量凭证分录的归档数据包，内置 SHA-256 数据防篡改防伪校验码。
      </el-alert>
      <el-form label-width="100px">
        <el-form-item label="归档年度">
          <div style="display: flex; gap: 12px; width: 100%;">
            <el-input-number v-model="archiveYear" :min="2000" :max="2099" style="width: 180px;" @change="inspectArchive" />
            <el-button :loading="archiveLoading" @click="inspectArchive">重新检查</el-button>
          </div>
        </el-form-item>
      </el-form>

      <div v-if="archivePreview" v-loading="archiveLoading" class="archive-preview-box">
        <h4>归档数据包摘要与合规校验</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="执行标准">{{ archivePreview.metadata.standard }}</el-descriptions-item>
          <el-descriptions-item label="归档年度">{{ archivePreview.metadata.fiscalYear }} 年度</el-descriptions-item>
          <el-descriptions-item label="账套企业">{{ archivePreview.company.name }}</el-descriptions-item>
          <el-descriptions-item label="本位币">{{ archivePreview.company.baseCurrency }}</el-descriptions-item>
          <el-descriptions-item label="会计期间数">{{ archivePreview.metadata.recordCounts.periods }} 个</el-descriptions-item>
          <el-descriptions-item label="会计科目数">{{ archivePreview.metadata.recordCounts.accounts }} 个</el-descriptions-item>
          <el-descriptions-item label="凭证总张数">{{ archivePreview.metadata.recordCounts.vouchers }} 张</el-descriptions-item>
          <el-descriptions-item label="分录总行数">{{ archivePreview.metadata.recordCounts.voucherEntries }} 行</el-descriptions-item>
          <el-descriptions-item label="SHA-256 校验和" :span="2">
            <code class="checksum-code">{{ archivePreview.metadata.sha256Checksum }}</code>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <template #footer>
        <el-button @click="archiveVisible = false">关闭</el-button>
        <el-button type="primary" :disabled="!archivePreview" @click="downloadArchive">
          下载国标归档包 (.json)
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
pre { max-height: 280px; overflow: auto; padding: 12px; background: var(--el-fill-color-light); white-space: pre-wrap; word-break: break-word; }
.archive-preview-box { margin-top: 12px; padding: 14px; background: var(--el-fill-color-light); border-radius: 6px; }
.archive-preview-box h4 { margin-top: 0; margin-bottom: 10px; color: var(--el-text-color-primary); }
.checksum-code { font-size: 11px; word-break: break-all; color: var(--el-color-primary); background: var(--el-fill-color-darker); padding: 2px 6px; border-radius: 4px; }
</style>
