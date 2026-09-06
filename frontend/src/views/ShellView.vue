<script setup lang="ts">
import {
  Calendar,
  Close,
  Collection,
  DataAnalysis,
  Document,
  DocumentChecked,
  Expand,
  Files,
  Finished,
  Fold,
  Money,
  Menu as MenuIcon,
  OfficeBuilding,
  Setting,
  SwitchButton,
  Tickets,
  Timer,
  UserFilled,
  Wallet,
  WalletFilled,
} from "@element-plus/icons-vue";
import { computed, onMounted, ref, type Component, watch } from "vue";
import { useRouter } from "vue-router";
import { ROLE_LABELS, useAuthStore } from "../stores/auth";

const router = useRouter();
const auth = useAuthStore();
const mobileMenuOpen = ref(false);
const desktopMenuCollapsed = ref(false);
const menuCollapsed = computed(() => desktopMenuCollapsed.value && !mobileMenuOpen.value);
const sidebarCollapsedStorageKey = "finance_sidebar_collapsed";

interface MenuLink {
  path: string;
  label: string;
  icon: Component;
  adminOnly?: boolean;
}

interface MenuGroup {
  index: string;
  label: string;
  icon: Component;
  children: MenuLink[];
}

const primaryMenu: MenuLink[] = [
  { path: "/", label: "工作台", icon: DataAnalysis },
  { path: "/vouchers", label: "凭证", icon: DocumentChecked },
  { path: "/accounting-periods", label: "会计期间", icon: Calendar },
  { path: "/reimbursements", label: "费用报销", icon: WalletFilled },
  { path: "/invoices", label: "电子发票", icon: Document },
  { path: "/sales-invoice-requests", label: "销项开票", icon: Document },
  { path: "/ar-ap", label: "往来管理", icon: UserFilled },
  { path: "/salaries", label: "工资管理", icon: Money },
];

const menuGroups: MenuGroup[] = [
  {
    index: "bank-management",
    label: "资金管理",
    icon: Wallet,
    children: [
      { path: "/bank", label: "银行流水", icon: Wallet },
      { path: "/bank-reconciliations", label: "银行对账", icon: Finished },
    ],
  },
  {
    index: "asset-management",
    label: "资产管理",
    icon: OfficeBuilding,
    children: [
      { path: "/fixed-assets", label: "固定资产", icon: OfficeBuilding },
      { path: "/depreciation", label: "自动折旧", icon: Timer },
    ],
  },
  {
    index: "books-reports",
    label: "账簿报表",
    icon: Tickets,
    children: [
      { path: "/ledgers", label: "账簿", icon: Files },
      { path: "/reports", label: "财务报表", icon: Tickets },
      { path: "/tax", label: "税务台账", icon: Tickets },
      { path: "/year-end-closing", label: "年末结转", icon: Finished },
    ],
  },
  {
    index: "operations",
    label: "经营管控",
    icon: DataAnalysis,
    children: [
      { path: "/dimensions", label: "结构化辅助核算", icon: Collection },
      { path: "/budgets", label: "预算与费用管控", icon: Tickets },
    ],
  },
  {
    index: "system-settings",
    label: "系统设置",
    icon: Setting,
    children: [
      { path: "/company-profile", label: "企业资料", icon: OfficeBuilding, adminOnly: true },
      { path: "/accounts", label: "会计科目", icon: Collection },
      { path: "/dictionary", label: "数据字典", icon: Setting },
      { path: "/report-templates", label: "报表模板", icon: Setting, adminOnly: true },
      { path: "/users", label: "用户与会话", icon: UserFilled, adminOnly: true },
      { path: "/audits", label: "审计中心", icon: Document, adminOnly: true },
    ],
  },
];

const visiblePrimaryMenu = computed(() => primaryMenu.filter(item => !item.adminOnly || auth.user?.role === "ADMIN"));
const visibleMenuGroups = computed(() => menuGroups.map(group => ({
  ...group,
  children: group.children.filter(item => !item.adminOnly || auth.user?.role === "ADMIN"),
})).filter(group => group.children.length > 0));
const activeGroup = computed(() => visibleMenuGroups.value.find(group => group.children.some(item => item.path === router.currentRoute.value.path))?.index);

function leave() {
  auth.logout();
  router.replace("/login");
}

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}

function toggleDesktopMenu() {
  desktopMenuCollapsed.value = !desktopMenuCollapsed.value;
  localStorage.setItem(sidebarCollapsedStorageKey, desktopMenuCollapsed.value ? "1" : "0");
}

watch(() => router.currentRoute.value.fullPath, closeMobileMenu);
onMounted(() => { desktopMenuCollapsed.value = localStorage.getItem(sidebarCollapsedStorageKey) === "1"; });
</script>

<template>
  <div class="app-shell">
    <button v-if="mobileMenuOpen" class="sidebar-backdrop" aria-label="关闭菜单" @click="closeMobileMenu"></button>
    <aside class="sidebar" :class="{ 'mobile-open': mobileMenuOpen, collapsed: menuCollapsed }">
      <div class="sidebar-brand">
        <span class="brand-mark small">财</span>
        <strong v-if="!menuCollapsed">企业财务</strong>
        <el-button
          class="desktop-menu-toggle"
          text
          :icon="menuCollapsed ? Expand : Fold"
          :title="menuCollapsed ? '展开菜单' : '折叠菜单'"
          :aria-label="menuCollapsed ? '展开菜单' : '折叠菜单'"
          @click="toggleDesktopMenu"
        />
        <el-button class="mobile-menu-close" text :icon="Close" title="关闭菜单" aria-label="关闭菜单" @click="closeMobileMenu"/>
      </div>
      <el-menu :collapse="menuCollapsed" :default-active="$route.path" :default-openeds="activeGroup ? [activeGroup] : []" router unique-opened @select="closeMobileMenu">
        <el-menu-item v-for="item in visiblePrimaryMenu" :key="item.path" :index="item.path" :title="item.label">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
        <el-sub-menu v-for="group in visibleMenuGroups" :key="group.index" :index="group.index" :title="group.label">
          <template #title>
            <el-icon><component :is="group.icon" /></el-icon>
            <span>{{ group.label }}</span>
          </template>
          <el-menu-item v-for="item in group.children" :key="item.path" :index="item.path" :title="item.label">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <div><el-button class="mobile-menu-toggle" text :icon="MenuIcon" title="打开菜单" aria-label="打开菜单" @click="mobileMenuOpen=true"/><b>{{ $route.meta.title ?? "财务工作台" }}</b><span>中国企业会计准则</span></div>
        <div class="topbar-user">
          <el-tag :type="auth.user?.role === 'ADMIN' ? 'success' : 'info'">{{ auth.user ? ROLE_LABELS[auth.user.role] : "" }}</el-tag>
          <span class="topbar-user-name">{{ auth.user?.displayName ?? "" }}</span>
          <el-button text :icon="SwitchButton" title="退出登录" @click="leave">退出</el-button>
        </div>
      </header>
      <main class="content"><RouterView /></main>
    </section>
  </div>
</template>

<style scoped>
.topbar-user { gap: 10px !important; }
.topbar-user-name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 800px) { .topbar-user-name { display: none; } }
</style>
