import { XMLParser, XMLValidator } from "fast-xml-parser";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";
import type { ParsedInvoice, ParsedInvoiceItem } from "./invoice.types.js";

type XmlObject = Record<string, unknown>;

const FIELD_ALIASES = {
  invoiceTypeName: [
    "InvoiceType",
    "InvoiceTypeName",
    "InvoiceKind",
    "InvoiceKindName",
    "InvoiceCategory",
    "InvoiceCategoryName",
    "InvoiceClass",
    "InvoiceClassName",
  ],
  invoiceTypeCode: [
    "InvoiceType",
    "InvoiceTypeCode",
    "InvoiceKind",
    "InvoiceKindCode",
    "InvoiceCategoryCode",
    "InvoiceClassCode",
    "InvoiceSortCode",
    "FPLXDM",
    "FPZLDM",
  ],
  specialInvoiceFlag: [
    "SpecialInvoiceFlag",
    "VatSpecialInvoiceFlag",
    "SpecialVatInvoiceFlag",
    "IsSpecialInvoice",
    "IsVatSpecialInvoice",
  ],
  invoiceNumber: ["InvoiceNumber", "InvoiceNo", "InvoiceNum"],
  issueTime: ["IssueTime", "IssueDate", "InvoiceDate"],
  sellerName: ["SellerName", "Name"],
  sellerId: ["SellerIdNum", "SellerTaxpayerNum", "TaxpayerId", "TaxNo"],
  buyerName: ["BuyerName", "Name"],
  buyerId: ["BuyerIdNum", "BuyerTaxpayerNum", "TaxpayerId", "TaxNo"],
  withoutTax: ["TotalAmWithoutTax", "TotalAmountWithoutTax", "AmountWithoutTax"],
  tax: ["TotalTaxAm", "TotalTaxAmount", "TaxAmount"],
  included: [
    "TotalTaxIncludedAmount",
    "TotalTax-includedAmount",
    "TotaltaxIncludedAmount",
    "TotalAmountWithTax",
    "AmountWithTax",
  ],
} as const;

export class XmlInvoiceParser {
  private readonly parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });

  parse(data: Buffer): ParsedInvoice {
    const xml = data.toString("utf8").replace(/^\uFEFF/, "");
    if (/<!DOCTYPE/i.test(xml)) throw new AppError("UNSAFE_INVOICE_XML", "XML 不允许包含 DOCTYPE", 400);
    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
      throw new AppError("INVALID_INVOICE_XML", `XML 格式错误：${validation.err.msg}`, 400);
    }
    const root = this.parser.parse(xml) as XmlObject;
    const seller = this.findSection(root, ["SellerInformation", "SellerInfo"]);
    const buyer = this.findSection(root, ["BuyerInformation", "BuyerInfo"]);
    const basic = this.findSection(root, ["BasicInformation", "BasicInfo", "InvoiceInformation"]);
    const supervision = this.findOptionalSection(root, ["TaxSupervisionInfo"]);
    const itemSection = this.findSection(root, ["IssuItemInformation", "InvoiceItemInformation", "Items"]);
    const totalAmountWithoutTax = this.money(this.required(basic, FIELD_ALIASES.withoutTax, "不含税金额"), "不含税金额");
    const totalTaxAmount = this.money(this.required(basic, FIELD_ALIASES.tax, "税额"), "税额");
    const totalTaxIncludedAmount = this.money(this.required(basic, FIELD_ALIASES.included, "价税合计"), "价税合计");
    if (!new Prisma.Decimal(totalAmountWithoutTax).plus(totalTaxAmount).equals(totalTaxIncludedAmount)) {
      throw new AppError("INVOICE_TOTAL_MISMATCH", "价税合计不等于不含税金额与税额之和", 400);
    }

    const requestTime = this.value(basic, ["RequestTime"]);
    const issueTime = requestTime === undefined
      ? this.requiredAny([basic, supervision], FIELD_ALIASES.issueTime, "开票时间")
      : this.scalar(requestTime);
    return {
      invoiceType: this.invoiceType(root),
      invoiceNumber: this.text(
        this.requiredAny([basic, supervision], FIELD_ALIASES.invoiceNumber, "发票号码"),
        64,
        "发票号码",
      ),
      issueTime: this.date(issueTime),
      sellerName: this.text(this.required(seller, FIELD_ALIASES.sellerName, "销售方名称"), 200, "销售方名称"),
      sellerIdNum: this.text(this.required(seller, FIELD_ALIASES.sellerId, "销售方识别号"), 64, "销售方识别号"),
      buyerName: this.text(this.required(buyer, FIELD_ALIASES.buyerName, "购买方名称"), 200, "购买方名称"),
      buyerIdNum: this.text(this.required(buyer, FIELD_ALIASES.buyerId, "购买方识别号"), 64, "购买方识别号"),
      totalAmountWithoutTax,
      totalTaxAmount,
      totalTaxIncludedAmount,
      currency: this.currency(this.value(basic, ["Currency", "CurrencyCode"]) ?? "CNY"),
      items: this.items(itemSection),
      rawData: root,
    };
  }

  private invoiceType(root: XmlObject): ParsedInvoice["invoiceType"] {
    const generalOrSpecialVat = this.findOptionalSection(root, ["GeneralOrSpecialVAT"]);
    if (generalOrSpecialVat) {
      const labelName = this.normalized(this.value(generalOrSpecialVat, ["LabelName"]));
      if (labelName.includes("\u4E13\u7528") || labelName.includes("\u4E13\u7968")) return "SPECIAL";
      if (labelName.includes("\u666E\u901A") || labelName.includes("\u666E\u7968")) return "ORDINARY";

      const labelCode = this.normalized(this.value(generalOrSpecialVat, ["LabelCode"]));
      if (labelCode === "01") return "SPECIAL";
      if (labelCode === "02") return "ORDINARY";
    }

    const names = this.searchValues(root, FIELD_ALIASES.invoiceTypeName).map((value) => this.normalized(value));
    if (names.some((text) => text.includes("专用") || text.includes("专票"))) return "SPECIAL";
    if (names.some((text) => text.includes("普通") || text.includes("普票"))) return "ORDINARY";

    const codes = this.searchValues(root, FIELD_ALIASES.invoiceTypeCode).map((value) => this.normalized(value));
    if (codes.some((code) => ["01", "02", "08", "20", "004", "028"].includes(code))) return "SPECIAL";
    if (codes.some((code) => ["04", "10", "11", "14", "21", "007", "025", "026"].includes(code))) return "ORDINARY";

    const flags = this.searchValues(root, FIELD_ALIASES.specialInvoiceFlag).map((value) => this.normalized(value));
    if (flags.some((flag) => ["Y", "YES", "TRUE", "1", "是", "专用", "专票"].includes(flag))) return "SPECIAL";
    if (flags.some((flag) => ["N", "NO", "FALSE", "0", "否", "普通", "普票"].includes(flag))) return "ORDINARY";
    return "UNKNOWN";
  }

  private normalized(value: unknown): string {
    return String(this.scalar(value) ?? "").trim().replace(/\s+/g, "").toUpperCase();
  }

  private items(section: XmlObject): ParsedInvoiceItem[] {
    const objects = this.itemObjects(section);
    if (objects.length === 0) throw new AppError("INVOICE_ITEMS_MISSING", "发票没有商品明细", 400);
    return objects.map((item, index) => ({
      lineNo: index + 1,
      itemName: this.text(this.required(item, ["ItemName", "GoodsName", "ProjectName"], "商品名称"), 500, "商品名称"),
      specification: this.optionalText(item, ["Specification", "SpecModel", "SpecificationModel"], 200, "规格型号"),
      unit: this.optionalText(item, ["Unit", "MeasurementUnit"], 50, "单位"),
      quantity: this.optionalRoundedDecimal(item, ["Quantity", "Qty"], 6, "数量"),
      unitPrice: this.optionalRoundedDecimal(item, ["UnitPrice", "UnPrice", "Price"], 6, "单价"),
      amount: this.money(this.required(item, ["Amount", "AmWithoutTax", "ItemAmount"], "明细金额"), "明细金额"),
      taxRate: this.taxRate(this.value(item, ["TaxRate", "TaxRateValue"])),
      taxAmount: this.optionalMoney(item, ["TaxAmount", "TaxAm", "ComTaxAm"]),
      taxClassificationCode: this.optionalText(
        item,
        ["TaxClassificationCode", "TaxClassCode", "GoodsTaxCode"],
        64,
        "税收分类编码",
      ),
    }));
  }

  private itemObjects(section: XmlObject): XmlObject[] {
    const result: XmlObject[] = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!this.isObject(value)) return;
      if (this.value(value, ["ItemName", "GoodsName", "ProjectName"]) !== undefined) {
        result.push(value);
        return;
      }
      Object.values(value).forEach(visit);
    };
    visit(section);
    return result;
  }

  private findSection(root: XmlObject, names: readonly string[]): XmlObject {
    const section = this.findOptionalSection(root, names);
    if (section) return section;
    throw new AppError("INVOICE_SECTION_MISSING", `缺少 XML 节点：${names[0]}`, 400);
  }

  private findOptionalSection(root: XmlObject, names: readonly string[]): XmlObject | null {
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    const queue: unknown[] = [root];
    while (queue.length) {
      const current = queue.shift();
      if (!this.isObject(current)) continue;
      for (const [key, value] of Object.entries(current)) {
        if (wanted.has(key.toLowerCase()) && this.isObject(value)) return value;
        if (wanted.has(key.toLowerCase()) && Array.isArray(value)) return { Items: value };
        if (Array.isArray(value)) queue.push(...value);
        else if (this.isObject(value)) queue.push(value);
      }
    }
    return null;
  }

  private requiredAny(objects: readonly (XmlObject | null)[], aliases: readonly string[], label: string): unknown {
    for (const object of objects) {
      if (!object) continue;
      const scalar = this.scalar(this.value(object, aliases));
      if (scalar !== undefined && scalar !== null && String(scalar).trim() !== "") return scalar;
    }
    throw new AppError("INVOICE_FIELD_MISSING", `缺少${label}`, 400);
  }

  private required(object: XmlObject, aliases: readonly string[], label: string): unknown {
    const value = this.value(object, aliases);
    const scalar = this.scalar(value);
    if (scalar === undefined || scalar === null || String(scalar).trim() === "") {
      throw new AppError("INVOICE_FIELD_MISSING", `缺少${label}`, 400);
    }
    return scalar;
  }

  private value(object: XmlObject, aliases: readonly string[]): unknown {
    const wanted = new Set(aliases.map((alias) => alias.toLowerCase()));
    const entry = Object.entries(object).find(([key]) => wanted.has(key.toLowerCase()));
    return entry?.[1];
  }

  private searchValues(root: XmlObject, aliases: readonly string[]): unknown[] {
    const wanted = new Set(aliases.map((alias) => alias.toLowerCase()));
    const values: unknown[] = [];
    const queue: unknown[] = [root];
    while (queue.length) {
      const current = queue.shift();
      if (!this.isObject(current)) continue;
      for (const [key, value] of Object.entries(current)) {
        if (wanted.has(key.toLowerCase())) values.push(value);
        if (Array.isArray(value)) queue.push(...value);
        else if (this.isObject(value)) queue.push(value);
      }
    }
    return values;
  }

  private text(value: unknown, maxLength: number, label: string): string {
    const result = String(this.scalar(value)).trim();
    if (result.length > maxLength) throw new AppError("INVOICE_FIELD_TOO_LONG", `${label}超过${maxLength}个字符`, 400);
    return result;
  }

  private optionalText(object: XmlObject, aliases: readonly string[], max: number, label: string) {
    const value = this.value(object, aliases);
    const scalar = this.scalar(value);
    return scalar === undefined || String(scalar).trim() === "" ? null : this.text(scalar, max, label);
  }

  private money(value: unknown, label: string) {
    return this.decimal(value, 4, label);
  }

  private optionalMoney(object: XmlObject, aliases: readonly string[]) {
    const value = this.value(object, aliases);
    const scalar = this.scalar(value);
    return scalar === undefined || String(scalar).trim() === "" ? null : this.money(scalar, "明细税额");
  }

  private optionalRoundedDecimal(object: XmlObject, aliases: readonly string[], scale: number, label: string) {
    const value = this.value(object, aliases);
    const scalar = this.scalar(value);
    if (scalar === undefined || String(scalar).trim() === "") return null;
    const text = String(scalar).trim().replaceAll(",", "");
    const maxInteger = 19 - scale;
    if (!new RegExp(`^-?\\d{1,${maxInteger}}(?:\\.\\d+)?$`).test(text)) {
      throw new AppError("INVALID_INVOICE_DECIMAL", `${label}格式错误：${value}`, 400);
    }
    return new Prisma.Decimal(text).toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP).toString();
  }

  private decimal(value: unknown, scale: number, label: string): string {
    const text = String(this.scalar(value)).trim().replaceAll(",", "");
    const maxInteger = 19 - scale;
    if (!new RegExp(`^-?\\d{1,${maxInteger}}(?:\\.\\d{1,${scale}})?$`).test(text)) {
      throw new AppError("INVALID_INVOICE_DECIMAL", `${label}格式错误：${value}`, 400);
    }
    return new Prisma.Decimal(text).toString();
  }

  private taxRate(value: unknown): string | null {
    const scalar = this.scalar(value);
    if (scalar === undefined || scalar === null || String(scalar).trim() === "") return null;
    const text = String(scalar).trim();
    if (text.endsWith("%") && !/^\d{1,3}(?:\.\d{1,6})?%$/.test(text)) {
      throw new AppError("INVALID_INVOICE_TAX_RATE", `税率格式错误：${value}`, 400);
    }
    const rate = text.endsWith("%")
      ? new Prisma.Decimal(text.slice(0, -1)).div(100)
      : new Prisma.Decimal(this.decimal(text, 6, "税率"));
    const normalized = rate.greaterThan(1) ? rate.div(100) : rate;
    if (normalized.isNegative() || normalized.greaterThan(1) || normalized.decimalPlaces() > 6) {
      throw new AppError("INVALID_INVOICE_TAX_RATE", `税率格式错误：${value}`, 400);
    }
    return normalized.toString();
  }

  private currency(value: unknown): string {
    const currency = String(this.scalar(value)).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new AppError("INVALID_INVOICE_CURRENCY", "币种格式错误", 400);
    return currency;
  }

  private date(value: unknown): Date {
    const text = String(this.scalar(value)).trim();
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?$/);
    const match =
      compact ??
      text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:Z|[+-]\d{2}:\d{2})?$/);
    if (!match) throw new AppError("INVALID_INVOICE_DATE", `开票时间格式错误：${text}`, 400);
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = match;
    // Invoice XML dates without an offset are calendar values. Store them at UTC
    // so the date remains stable regardless of the VPS process timezone.
    const result = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    if (
      result.getUTCFullYear() !== Number(y) ||
      result.getUTCMonth() !== Number(m) - 1 ||
      result.getUTCDate() !== Number(d) ||
      result.getUTCHours() !== Number(hh) ||
      result.getUTCMinutes() !== Number(mm) ||
      result.getUTCSeconds() !== Number(ss)
    ) {
      throw new AppError("INVALID_INVOICE_DATE", `开票时间无效：${text}`, 400);
    }
    return result;
  }

  private isObject(value: unknown): value is XmlObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private scalar(value: unknown): unknown {
    if (this.isObject(value) && "#text" in value) return value["#text"];
    return value;
  }
}
