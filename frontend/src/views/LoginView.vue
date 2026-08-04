<script setup lang="ts">
import { Lock, User } from "@element-plus/icons-vue";
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
const router = useRouter(); const auth = useAuthStore(); const loading = ref(false);
const form = reactive({ username: "", password: "" });
async function submit() { loading.value = true; try { await auth.login(form.username, form.password); router.replace("/"); } finally { loading.value = false; } }
</script>
<template>
  <main class="login-page"><section class="login-panel"><div class="login-brand"><div class="brand-mark">财</div><div><h1>企业财务系统</h1><p>会计凭证 · 账簿 · 报表</p></div></div>
    <el-form :model="form" @submit.prevent="submit"><el-form-item><el-input v-model="form.username" size="large" placeholder="用户名" :prefix-icon="User" /></el-form-item><el-form-item><el-input v-model="form.password" size="large" type="password" show-password placeholder="密码" :prefix-icon="Lock" @keyup.enter="submit" /></el-form-item><el-button class="login-button" type="primary" size="large" :loading="loading" @click="submit">登录</el-button></el-form>
  </section></main>
</template>
