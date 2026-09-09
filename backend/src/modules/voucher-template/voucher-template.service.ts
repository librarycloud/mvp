import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import type { CreateVoucherTemplateInput, VoucherTemplateItem } from "./voucher-template.types.js";

const BUILTIN_TEMPLATES = [
  {
    name: "计提企业五险一金",
    category: "SALARY" as const,
    summary: "计提本月企业应负担社会保险及住房公积金",
    description: "借：管理费用-社保费，贷：应付职工薪酬-社会保险费/公积金",
    lines: [
      { lineNo: 1, accountCode: "6602", direction: "DEBIT" as const, summary: "计提企业五险一金" },
      { lineNo: 2, accountCode: "2211", direction: "CREDIT" as const, summary: "计提企业五险一金" },
    ],
  },
  {
    name: "计提借款利息",
    category: "FINANCE" as const,
    summary: "计提本月银行借款利息支出",
    description: "借：财务费用-利息支出，贷：应付利息",
    lines: [
      { lineNo: 1, accountCode: "6603", direction: "DEBIT" as const, summary: "计提本月银行借款利息" },
      { lineNo: 2, accountCode: "2231", direction: "CREDIT" as const, summary: "计提本月银行借款利息" },
    ],
  },
  {
    name: "计提房屋租金",
    category: "EXPENSE" as const,
    summary: "计提本月办公场所房屋租赁费用",
    description: "借：管理费用-租赁费，贷：其他应付款",
    lines: [
      { lineNo: 1, accountCode: "6602", direction: "DEBIT" as const, summary: "计提本月办公房屋租金" },
      { lineNo: 2, accountCode: "2241", direction: "CREDIT" as const, summary: "计提本月办公房屋租金" },
    ],
  },
  {
    name: "支付日常办公费与快递费",
    category: "EXPENSE" as const,
    summary: "银行存款支付日常办公杂费",
    description: "借：管理费用-办公费，贷：银行存款",
    lines: [
      { lineNo: 1, accountCode: "6602", direction: "DEBIT" as const, summary: "支付日常办公及快递费" },
      { lineNo: 2, accountCode: "1002", direction: "CREDIT" as const, summary: "支付日常办公及快递费" },
    ],
  },
  {
    name: "扣收银行手续费",
    category: "FINANCE" as const,
    summary: "银行账户直接扣收账户管理费与转账手续费",
    description: "借：财务费用-手续费，贷：银行存款",
    lines: [
      { lineNo: 1, accountCode: "6603", direction: "DEBIT" as const, summary: "扣收银行结算手续费" },
      { lineNo: 2, accountCode: "1002", direction: "CREDIT" as const, summary: "扣收银行结算手续费" },
    ],
  },
];

export class VoucherTemplateService {
  private customTemplates: VoucherTemplateItem[] = [];

  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<VoucherTemplateItem[]> {
    const allAccounts = typeof this.prisma?.account?.findMany === "function"
      ? await this.prisma.account.findMany({
          where: { deletedAt: null, isEnabled: true },
          select: { id: true, code: true, name: true, isLeaf: true },
        })
      : [];

    const accountMap = new Map(allAccounts.map((a) => [a.code, a]));

    const builtins: VoucherTemplateItem[] = BUILTIN_TEMPLATES.map((tpl, index) => {
      return {
        id: index + 1,
        name: tpl.name,
        category: tpl.category,
        summary: tpl.summary,
        description: tpl.description,
        isBuiltIn: true,
        entries: tpl.lines.map((l) => {
          const acc = accountMap.get(l.accountCode) ??
            allAccounts.find((a) => a.code.startsWith(l.accountCode) && a.isLeaf) ??
            { id: 9999, code: l.accountCode, name: "预设科目" };
          return {
            lineNo: l.lineNo,
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            direction: l.direction,
            summary: l.summary,
          };
        }),
      };
    });

    return [...builtins, ...this.customTemplates];
  }

  async create(input: CreateVoucherTemplateInput): Promise<VoucherTemplateItem> {
    if (!input.name?.trim()) throw new AppError("INVALID_TEMPLATE_NAME", "模板名称不能为空", 400);
    if (!input.entries || input.entries.length < 2) {
      throw new AppError("INVALID_TEMPLATE_ENTRIES", "模板分录至少需要包含两行", 400);
    }

    const newId = 1000 + this.customTemplates.length + 1;
    const allAccounts = typeof this.prisma?.account?.findMany === "function"
      ? await this.prisma.account.findMany({
          where: { id: { in: input.entries.map((e) => e.accountId) } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const accMap = new Map(allAccounts.map((a) => [a.id, a]));

    const template: VoucherTemplateItem = {
      id: newId,
      name: input.name.trim(),
      category: input.category ?? "COMMON",
      summary: input.summary?.trim() || input.name.trim(),
      description: input.description?.trim() || null,
      isBuiltIn: false,
      entries: input.entries.map((e) => ({
        lineNo: e.lineNo,
        accountId: e.accountId,
        accountCode: accMap.get(e.accountId)?.code,
        accountName: accMap.get(e.accountId)?.name,
        direction: e.direction,
        summary: e.summary,
      })),
    };

    this.customTemplates.push(template);
    return template;
  }

  async remove(id: number): Promise<void> {
    const index = this.customTemplates.findIndex((t) => t.id === id);
    if (index === -1) {
      if (id <= BUILTIN_TEMPLATES.length) throw new AppError("CANNOT_DELETE_BUILTIN", "内置模板不能删除", 400);
      throw new AppError("TEMPLATE_NOT_FOUND", "模板不存在", 404);
    }
    this.customTemplates.splice(index, 1);
  }
}
