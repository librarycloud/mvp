export interface ValidationIssue {
  instancePath?: string;
  keyword?: string;
  params?: Record<string, unknown>;
  message?: string;
}

const FIELD_LABELS: Record<string, string> = {
  id: "记录ID",
  username: "用户名",
  password: "密码",
  refreshToken: "刷新令牌",
  page: "页码",
  pageSize: "每页数量",
  keyword: "搜索关键词",
  status: "状态",
  reason: "原因",
  remark: "备注",
  description: "说明",
  amount: "金额",
  currency: "币种",
  startDate: "开始日期",
  endDate: "结束日期",
  dateFrom: "开始日期",
  dateTo: "结束日期",
  startTime: "开始时间",
  endTime: "结束时间",
  paymentDate: "付款日期",
  postingDate: "入账日期",
  voucherDate: "凭证日期",
  expenseDate: "费用日期",
  purchaseDate: "购买日期",
  startUseDate: "启用日期",
  disposalDate: "处置日期",
  periodId: "会计期间",
  fiscalYear: "会计年度",
  fiscalPeriod: "会计月份",
  accountId: "会计科目",
  bankAccountId: "银行科目",
  expenseAccountId: "费用或资产科目",
  paymentAccountId: "付款科目",
  inputTaxAccountId: "进项税额科目",
  accumulatedDepreciationAccountId: "累计折旧科目",
  depreciationExpenseAccountId: "折旧费用科目",
  profitAccountId: "本年利润科目",
  proceedsAccountId: "收款科目",
  gainLossAccountId: "处置损益科目",
  bankTransactionId: "银行流水",
  voucherEntryId: "凭证分录",
  voucherId: "凭证",
  invoiceId: "发票",
  invoiceIds: "发票列表",
  invoiceTaxTreatments: "发票抵扣处理",
  evidenceType: "报销凭证类型",
  evidenceDescription: "凭证说明或无票原因",
  deductibleTaxAmount: "可抵扣税额",
  matchedAmount: "匹配金额",
  statementOpeningBalance: "银行期初余额",
  statementClosingBalance: "银行期末余额",
  applicantName: "报销人",
  department: "部门",
  expenseType: "费用类型",
  entries: "凭证分录",
  debitAmount: "借方金额",
  creditAmount: "贷方金额",
  summary: "摘要",
  accountCode: "科目编码",
  code: "编码",
  name: "名称",
  category: "类别",
  direction: "方向",
  assetNo: "资产编号",
  originalValue: "资产原值",
  residualRate: "残值率",
  usefulLifeMonths: "折旧年限",
  depreciationMethod: "折旧方法",
  disposalType: "处置方式",
  proceeds: "处置收入",
  unifiedSocialCreditCode: "统一社会信用代码",
  bankName: "开户银行",
  bankAccount: "银行账号",
  role: "用户角色",
};

const TYPE_LABELS: Record<string, string> = {
  string: "文本",
  integer: "整数",
  number: "数字",
  boolean: "布尔值",
  array: "列表",
  object: "对象",
  null: "空值",
};

function decodePointer(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function issueParts(issue: ValidationIssue): string[] {
  const parts = (issue.instancePath ?? "").split("/").filter(Boolean).map(decodePointer);
  const property = issue.keyword === "required"
    ? issue.params?.missingProperty
    : issue.keyword === "additionalProperties"
      ? issue.params?.additionalProperty
      : undefined;
  if (typeof property === "string" && property) parts.push(property);
  return parts;
}

function fieldName(issue: ValidationIssue): string {
  const parts = issueParts(issue);
  if (!parts.length) return "请求参数";
  return parts.map((part) => /^\d+$/.test(part) ? `第${Number(part) + 1}项` : FIELD_LABELS[part] ?? part).join(" > ");
}

function issueMessage(issue: ValidationIssue): string {
  const field = fieldName(issue);
  const params = issue.params ?? {};
  switch (issue.keyword) {
    case "required": return `缺少${field}`;
    case "additionalProperties": return `不支持字段：${field}`;
    case "type": return `${field}必须是${TYPE_LABELS[String(params.type)] ?? String(params.type ?? "正确类型")}`;
    case "format": {
      const format = String(params.format ?? "");
      if (format === "date") return `${field}格式不正确，应为 YYYY-MM-DD`;
      if (format === "date-time") return `${field}格式不正确，应为完整日期时间`;
      return `${field}格式不正确`;
    }
    case "pattern": return `${field}格式不正确`;
    case "minimum": return `${field}不能小于 ${String(params.limit)}`;
    case "maximum": return `${field}不能大于 ${String(params.limit)}`;
    case "exclusiveMinimum": return `${field}必须大于 ${String(params.limit)}`;
    case "exclusiveMaximum": return `${field}必须小于 ${String(params.limit)}`;
    case "minLength": return Number(params.limit) === 1 ? `${field}不能为空` : `${field}至少填写 ${String(params.limit)} 个字符`;
    case "maxLength": return `${field}最多填写 ${String(params.limit)} 个字符`;
    case "minItems": return `${field}至少需要 ${String(params.limit)} 项`;
    case "maxItems": return `${field}最多允许 ${String(params.limit)} 项`;
    case "uniqueItems": return `${field}不能包含重复项`;
    case "enum":
    case "const":
    case "anyOf":
    case "oneOf": return `${field}的值不在允许范围内`;
    default: return `${field}${issue.message ? `：${issue.message}` : "填写不正确"}`;
  }
}

function priority(issue: ValidationIssue): number {
  if (["required", "additionalProperties"].includes(issue.keyword ?? "")) return 100;
  if (["format", "pattern", "enum"].includes(issue.keyword ?? "")) return 90;
  if (["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems", "uniqueItems"].includes(issue.keyword ?? "")) return 80;
  if (["anyOf", "oneOf"].includes(issue.keyword ?? "")) return 75;
  if (issue.keyword === "type") return 70;
  return 50;
}

export function formatValidationMessage(issues: readonly ValidationIssue[]): string {
  if (!issues.length) return "请求参数填写不正确";
  const selected = new Map<string, ValidationIssue>();
  for (const issue of issues) {
    const key = issueParts(issue).join("/") || "request";
    const current = selected.get(key);
    if (!current || priority(issue) > priority(current)) selected.set(key, issue);
  }
  const messages = [...selected.values()].map(issueMessage);
  const visible = messages.slice(0, 5);
  return `${visible.join("；")}${messages.length > visible.length ? `；另有 ${messages.length - visible.length} 处错误` : ""}`;
}
