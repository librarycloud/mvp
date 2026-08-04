<script setup lang="ts">
withDefaults(defineProps<{ total: number; pageSizes?: number[] }>(), {
  pageSizes: () => [20, 50, 100, 200],
});

const page = defineModel<number>("page", { required: true });
const pageSize = defineModel<number>("pageSize", { required: true });
const emit = defineEmits<{ change: [] }>();

function changePage() {
  emit("change");
}

function changePageSize() {
  page.value = 1;
  emit("change");
}
</script>

<template>
  <div class="pagination-row">
    <span>共 {{ total }} 条</span>
    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="pageSizes"
      layout="sizes, prev, pager, next, jumper"
      @current-change="changePage"
      @size-change="changePageSize"
    />
  </div>
</template>

<style scoped>
.pagination-row { display:flex; justify-content:space-between; align-items:center; gap:16px; padding-top:14px; color:#667085; font-size:13px; }
@media (max-width:800px) { .pagination-row { align-items:flex-start; flex-direction:column; } }
</style>
