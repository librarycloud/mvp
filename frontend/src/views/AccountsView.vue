<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../utils/api";
const loading = ref(false); const accounts = ref<any[]>([]); const keyword = ref("");
async function load() { loading.value = true; try { accounts.value = await api.get(`/accounts?tree=true${keyword.value ? `&keyword=${encodeURIComponent(keyword.value)}` : ""}`); } finally { loading.value = false; } }
onMounted(load);
</script>
<template><div class="page-grid"><section class="page-heading"><div><h2>会计科目</h2><p>维护树形科目和可过账明细科目。</p></div><div><el-input v-model="keyword" placeholder="编码或名称" clearable @keyup.enter="load" /><el-button type="primary" @click="load">查询</el-button></div></section><el-card shadow="never"><el-tree v-loading="loading" :data="accounts" node-key="id" :props="{ label: 'name', children: 'children' }" default-expand-all><template #default="{ data }"><span class="tree-node"><b>{{ data.code }}</b><span>{{ data.name }}</span><el-tag size="small" :type="data.isEnabled ? 'success' : 'info'">{{ data.isEnabled ? '启用' : '停用' }}</el-tag></span></template></el-tree></el-card></div></template>
