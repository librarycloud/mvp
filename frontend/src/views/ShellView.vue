<script setup lang="ts">
import {
  ArrowDown,
  Box,
  Calendar,
  CircleCheck,
  Close,
  Collection,
  CreditCard,
  DataAnalysis,
  Document,
  DocumentChecked,
  DocumentCopy,
  Expand,
  Files,
  Finished,
  Fold,
  Lock,
  Money,
  Menu as MenuIcon,
  Notebook,
  OfficeBuilding,
  PieChart,
  Plus,
  Setting,
  Stamp,
  SwitchButton,
  Timer,
  TrendCharts,
  User,
  UserFilled,
  Wallet,
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
  { path: "/vouchers", label: "凭证管理", icon: DocumentChecked },
  { path: "/accounting-periods", label: "会计期间", icon: Calendar },
  { path: "/bank", label: "银行流水", icon: Wallet },
  { path: "/bank-reconciliations", label: "银行对账", icon: CircleCheck },
  { path: "/invoices", label: "电子发票", icon: Document },
  { path: "/sales-invoice-requests", label: "销项开票", icon: DocumentCopy },
  { path: "/reimbursements", label: "费用报销", icon: CreditCard },
  { path: "/ar-ap", label: "往来管理", icon: UserFilled },
  { path: "/salaries", label: "工资管理", icon: Money },
];

const menuGroups: MenuGroup[] = [
  {
    index: "asset-management",
    label: "资产管理",
    icon: Box,
    children: [
      { path: "/fixed-assets", label: "固定资产", icon: Box },
      { path: "/depreciation", label: "自动折旧", icon: Timer },
    ],
  },
  {
    index: "books-reports",
    label: "账簿与税务",
    icon: Files,
    children: [
      { path: "/ledgers", label: "账簿明细", icon: Files },
      { path: "/reports", label: "财务报表", icon: TrendCharts },
      { path: "/tax", label: "税务申报", icon: Stamp },
      { path: "/year-end-closing", label: "年末结转", icon: Finished },
    ],
  },
  {
    index: "system-settings",
    label: "基础与系统设置",
    icon: Setting,
    children: [
      { path: "/budgets", label: "预算与费控", icon: PieChart },
      { path: "/dimensions", label: "辅助核算", icon: Collection },
      { path: "/accounts", label: "会计科目", icon: Notebook },
      { path: "/report-templates", label: "报表模板", icon: Setting, adminOnly: true },
      { path: "/company-profile", label: "企业资料", icon: OfficeBuilding, adminOnly: true },
      { path: "/dictionary", label: "数据字典", icon: Setting },
      { path: "/users", label: "用户与会话", icon: User, adminOnly: true },
      { path: "/audits", label: "审计中心", icon: Lock, adminOnly: true },
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

// 多标签工作区 (Multi-Tab Workspace)
interface TabItem {
  path: string;
  fullPath: string;
  title: string;
  closable: boolean;
}

const tabs = ref<TabItem[]>([
  { path: "/", fullPath: "/", title: "工作台", closable: false },
]);
const activeTab = ref("/");

function getTabTitle(path: string, metaTitle?: unknown): string {
  if (metaTitle && typeof metaTitle === "string") return metaTitle;
  const primary = primaryMenu.find((m) => m.path === path);
  if (primary) return primary.label;
  for (const g of menuGroups) {
    const child = g.children.find((c) => c.path === path);
    if (child) return child.label;
  }
  return "工作区";
}

watch(
  () => router.currentRoute.value,
  (route) => {
    closeMobileMenu();
    const path = route.path;
    const fullPath = route.fullPath;
    activeTab.value = path;
    const existing = tabs.value.find((t) => t.path === path);
    if (existing) {
      existing.fullPath = fullPath;
    } else {
      const title = getTabTitle(path, route.meta?.title);
      tabs.value.push({
        path,
        fullPath,
        title,
        closable: path !== "/",
      });
    }
  },
  { immediate: true },
);

function switchTab(tabPath: string) {
  const target = tabs.value.find((t) => t.path === tabPath);
  if (target && target.fullPath !== router.currentRoute.value.fullPath) {
    router.push(target.fullPath);
  }
}

function removeTab(tabPath: string) {
  const index = tabs.value.findIndex((t) => t.path === tabPath);
  if (index === -1) return;
  const isClosingActive = activeTab.value === tabPath;
  tabs.value.splice(index, 1);
  if (isClosingActive) {
    const nextTab = tabs.value[index] || tabs.value[index - 1] || tabs.value[0];
    if (nextTab) {
      router.push(nextTab.fullPath);
    }
  }
}

function closeOtherTabs() {
  tabs.value = tabs.value.filter((t) => !t.closable || t.path === activeTab.value);
}

function closeAllTabs() {
  tabs.value = tabs.value.filter((t) => !t.closable);
  router.push("/");
}

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
        <div style="display: flex; align-items: center; gap: 16px;">
          <el-button class="mobile-menu-toggle" text :icon="MenuIcon" title="打开菜单" aria-label="打开菜单" @click="mobileMenuOpen=true"/>
          
          <el-dropdown trigger="click" @command="(path: string) => router.push(path)">
            <el-button type="primary" size="small" :icon="Plus" plain>快捷录入</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="/vouchers">手工填制凭证</el-dropdown-item>
                <el-dropdown-item command="/invoices">进销项发票登记</el-dropdown-item>
                <el-dropdown-item command="/bank">银行流水导入</el-dropdown-item>
                <el-dropdown-item command="/ar-ap" divided>应收应付往来单据</el-dropdown-item>
                <el-dropdown-item command="/reimbursements">员工费用报销</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <el-breadcrumb separator="/" style="margin-left: 8px;">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="$route.path !== '/'">{{ getTabTitle($route.path, $route.meta?.title) }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="topbar-user">
          <el-tag :type="auth.user?.role === 'ADMIN' ? 'success' : 'info'">{{ auth.user ? ROLE_LABELS[auth.user.role] : "" }}</el-tag>
          <span class="topbar-user-name">{{ auth.user?.displayName ?? "" }}</span>
          <el-button text :icon="SwitchButton" title="退出登录" @click="leave">退出</el-button>
        </div>
      </header>

      <!-- Multi-Tab Workspaces Bar -->
      <nav class="tabs-nav-bar" aria-label="工作区多标签栏">
        <div class="tabs-list">
          <div
            v-for="t in tabs"
            :key="t.path"
            class="tab-item"
            :class="{ active: activeTab === t.path }"
            @click="switchTab(t.path)"
          >
            <span class="tab-title">{{ t.title }}</span>
            <el-icon
              v-if="t.closable"
              class="tab-close"
              title="关闭标签"
              @click.stop="removeTab(t.path)"
            >
              <Close />
            </el-icon>
          </div>
        </div>
        <div class="tabs-actions">
          <el-dropdown trigger="click">
            <el-button text size="small" class="tab-more-btn">
              操作 <el-icon><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="closeOtherTabs">关闭其他标签</el-dropdown-item>
                <el-dropdown-item @click="closeAllTabs">关闭所有标签</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </nav>

      <main class="content">
        <RouterView v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </RouterView>
      </main>
    </section>
  </div>
</template>

<style scoped>
.topbar-user { gap: 10px !important; }
.topbar-user-name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 800px) { .topbar-user-name { display: none; } }

/* TabBar 多标签页样式 */
.tabs-nav-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  background: #f8fafc;
  border-bottom: 1px solid #dcdfe6;
  padding: 8px 16px 0;
  height: 40px;
  box-sizing: border-box;
}

.tabs-list {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  align-items: flex-end;
  height: 100%;
}
.tabs-list::-webkit-scrollbar { display: none; }

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  background: #f1f5f9;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  user-select: none;
  height: 32px;
  margin-bottom: -1px; /* 下移1px覆盖父级的底部边框 */
  box-sizing: border-box;
}

.tab-item:hover {
  background: #e2e8f0;
  color: #334155;
}

.tab-item.active {
  background: #ffffff;
  color: #0f766e;
  font-weight: 600;
  border-color: #dcdfe6;
  border-bottom-color: #ffffff;
}

.tab-close {
  font-size: 10px;
  padding: 2px;
  border-radius: 50%;
  color: #94a3b8;
  transition: all 0.15s ease;
}

.tab-close:hover {
  background: #cbd5e1;
  color: #0f172a;
}

.tabs-actions {
  display: flex;
  align-items: center;
  margin-bottom: 2px;
}

.tab-more-btn {
  font-size: 12px;
  color: #64748b;
  padding: 2px 8px;
}
</style>
