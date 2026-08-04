import type { App } from "vue";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import {
  ElButton,
  ElAlert,
  ElCard,
  ElDatePicker,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElLoading,
  ElMenu,
  ElMenuItem,
  ElSubMenu,
  ElOption,
  ElPagination,
  ElSelect,
  ElSegmented,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
  ElTree,
  ElUpload,
  provideGlobalConfig,
} from "element-plus";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/alert/style/css";
import "element-plus/es/components/card/style/css";
import "element-plus/es/components/date-picker/style/css";
import "element-plus/es/components/descriptions/style/css";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/drawer/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/icon/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/input-number/style/css";
import "element-plus/es/components/loading/style/css";
import "element-plus/es/components/menu/style/css";
import "element-plus/es/components/sub-menu/style/css";
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/message-box/style/css";
import "element-plus/es/components/option/style/css";
import "element-plus/es/components/pagination/style/css";
import "element-plus/es/components/select/style/css";
import "element-plus/es/components/segmented/style/css";
import "element-plus/es/components/table/style/css";
import "element-plus/es/components/tabs/style/css";
import "element-plus/es/components/tag/style/css";
import "element-plus/es/components/tree/style/css";
import "element-plus/es/components/upload/style/css";

const components = [
  ElAlert,
  ElButton,
  ElCard,
  ElDatePicker,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElMenu,
  ElMenuItem,
  ElSubMenu,
  ElOption,
  ElPagination,
  ElSelect,
  ElSegmented,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
  ElTree,
  ElUpload,
];

export function installElementPlus(app: App) {
  for (const component of components) app.use(component);
  app.use(ElLoading);
  provideGlobalConfig({ locale: zhCn }, app, true);
}
