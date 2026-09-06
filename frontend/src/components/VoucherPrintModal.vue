<script setup lang="ts">
import { computed } from "vue";
import { numberToChineseAmount } from "../utils/chinese-amount";
import { formatBusinessDate } from "../utils/date";

const props = defineProps<{
  modelValue: boolean;
  voucher: any;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const chineseTotal = computed(() => {
  if (!props.voucher) return "零元整";
  return numberToChineseAmount(props.voucher.totalDebit);
});

function formatMoney(val: unknown) {
  if (val === undefined || val === null || val === "") return "";
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function handlePrint() {
  window.print();
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="打印记账凭证"
    width="920px"
    class="voucher-print-dialog"
    destroy-on-close
  >
    <div class="print-toolbar no-print">
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="提示：可直接点击下方【立即打印】按钮，或使用快捷键 Ctrl+P / Cmd+P 唤起浏览器打印对话框并另存为 PDF。"
        style="margin-bottom: 16px;"
      />
    </div>

    <!-- 记账凭证标准打印纸面 -->
    <div id="printable-voucher" class="voucher-paper" v-if="voucher">
      <div class="voucher-header">
        <div class="voucher-title">记 账 凭 证</div>
        <div class="voucher-meta">
          <div class="meta-item">
            <span class="label">凭证日期：</span>
            <span>{{ formatBusinessDate(voucher.voucherDate) }}</span>
          </div>
          <div class="meta-item">
            <span class="label">凭证编号：</span>
            <span class="strong">{{ voucher.voucherNo }}</span>
          </div>
          <div class="meta-item">
            <span class="label">附单据数：</span>
            <span>{{ voucher.attachmentCount ?? 0 }} 张</span>
          </div>
        </div>
      </div>

      <table class="voucher-table">
        <thead>
          <tr>
            <th class="col-summary">摘 要</th>
            <th class="col-account">会 计 科 目</th>
            <th class="col-money">借 方 金 额</th>
            <th class="col-money">贷 方 金 额</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, index) in voucher.entries" :key="index">
            <td class="cell-summary">{{ entry.summary }}</td>
            <td class="cell-account">
              <div class="account-code-name">
                {{ entry.account?.code }} {{ entry.account?.name }}
              </div>
              <div v-if="entry.dimensions && entry.dimensions.length" class="account-dims">
                <span v-for="dim in entry.dimensions" :key="dim.id" class="dim-tag">
                  [{{ dim.dimension?.name }}: {{ dim.dimensionMember?.name }}]
                </span>
              </div>
            </td>
            <td class="cell-money" :class="{ 'red-text': Number(entry.debitAmount) < 0 }">
              {{ Number(entry.debitAmount) !== 0 ? formatMoney(entry.debitAmount) : '' }}
            </td>
            <td class="cell-money" :class="{ 'red-text': Number(entry.creditAmount) < 0 }">
              {{ Number(entry.creditAmount) !== 0 ? formatMoney(entry.creditAmount) : '' }}
            </td>
          </tr>
          <!-- 补足空白行，使凭证看起来规整 -->
          <tr v-for="i in Math.max(0, 5 - (voucher.entries?.length || 0))" :key="'blank-' + i" class="blank-row">
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td class="total-label">合计金额（大写）</td>
            <td class="total-chinese">{{ chineseTotal }}</td>
            <td class="total-debit cell-money" :class="{ 'red-text': Number(voucher.totalDebit) < 0 }">
              {{ formatMoney(voucher.totalDebit) }}
            </td>
            <td class="total-credit cell-money" :class="{ 'red-text': Number(voucher.totalCredit) < 0 }">
              {{ formatMoney(voucher.totalCredit) }}
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- 财务四签落款栏 -->
      <div class="voucher-signatures">
        <div class="sig-item"><span>财务主管：</span><span class="sig-name"></span></div>
        <div class="sig-item"><span>记账：</span><span class="sig-name">{{ voucher.postedBy?.displayName ?? '' }}</span></div>
        <div class="sig-item"><span>审核：</span><span class="sig-name">{{ voucher.reviewer?.displayName ?? '' }}</span></div>
        <div class="sig-item"><span>出纳：</span><span class="sig-name"></span></div>
        <div class="sig-item"><span>制单：</span><span class="sig-name">{{ voucher.createdBy?.displayName ?? '制单人' }}</span></div>
      </div>
    </div>

    <template #footer>
      <div class="no-print">
        <el-button @click="visible = false">关闭</el-button>
        <el-button type="primary" @click="handlePrint">立即打印</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.voucher-paper {
  background: #fff;
  padding: 24px;
  color: #111;
  font-family: "SimSun", "Songti SC", "STSong", "Songti TC", serif;
}

.voucher-header {
  text-align: center;
  margin-bottom: 12px;
}

.voucher-title {
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 6px;
  border-bottom: 2px double #333;
  display: inline-block;
  padding-bottom: 4px;
  margin-bottom: 12px;
}

.voucher-meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #333;
  margin-top: 6px;
}

.voucher-meta .strong {
  font-weight: bold;
}

.voucher-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #333;
  font-size: 13px;
  margin-top: 4px;
}

.voucher-table th,
.voucher-table td {
  border: 1px solid #444;
  padding: 6px 8px;
  min-height: 28px;
}

.voucher-table th {
  background: #f7f7f7;
  font-weight: bold;
  text-align: center;
}

.col-summary { width: 28%; }
.col-account { width: 36%; }
.col-money { width: 18%; }

.cell-summary {
  text-align: left;
}

.cell-account {
  text-align: left;
}

.account-dims {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}

.dim-tag {
  margin-right: 4px;
}

.cell-money {
  text-align: right;
  font-family: "Consolas", "Courier New", monospace;
  font-size: 14px;
}

.total-row {
  font-weight: bold;
  background: #fafafa;
}

.total-label {
  text-align: center;
}

.total-chinese {
  font-size: 13px;
  color: #222;
}

.voucher-signatures {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 13px;
  padding: 0 4px;
}

.sig-item {
  display: flex;
  align-items: center;
}

.sig-name {
  display: inline-block;
  min-width: 60px;
  border-bottom: 1px solid #888;
  margin-left: 4px;
  text-align: center;
}

.red-text {
  color: #d32f2f !important;
}

/* 打印样式 */
@media print {
  body * {
    visibility: hidden;
  }
  .no-print,
  .el-dialog__header,
  .el-dialog__footer,
  .el-overlay {
    display: none !important;
  }
  #printable-voucher,
  #printable-voucher * {
    visibility: visible;
  }
  #printable-voucher {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    padding: 10mm;
    box-shadow: none;
  }
}
</style>
