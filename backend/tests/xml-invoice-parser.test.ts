import { describe, expect, it } from "vitest";
import { XmlInvoiceParser } from "../src/modules/invoice/xml-invoice-parser.js";
import { invoiceXml } from "./fixtures/invoice-xml.js";

describe("XmlInvoiceParser", () => {
  it("parses namespaced invoice data and multiple items", () => {
    const result = new XmlInvoiceParser().parse(Buffer.from(invoiceXml(), "utf8"));

    expect(result).toMatchObject({
      invoiceType: "UNKNOWN",
      invoiceNumber: "INV-2026-0001",
      sellerName: "示例科技有限公司",
      buyerIdNum: "91310000BUYER001",
      totalAmountWithoutTax: "150",
      totalTaxAmount: "16",
      totalTaxIncludedAmount: "166",
      currency: "CNY",
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      lineNo: 1,
      itemName: "软件服务",
      taxRate: "0.13",
      taxClassificationCode: "304020101",
    });
    expect(JSON.stringify(result.rawData)).toContain("TaxSupervisionInfo");
  });

  it("classifies special and ordinary invoice type fields", () => {
    const special = invoiceXml("SPECIAL-001").replace(
      "<e:InvoiceNumber>SPECIAL-001</e:InvoiceNumber>",
      "<e:InvoiceNumber>SPECIAL-001</e:InvoiceNumber><e:InvoiceType>电子发票（增值税专用发票）</e:InvoiceType>",
    );
    const ordinary = invoiceXml("ORDINARY-001").replace(
      "<e:InvoiceNumber>ORDINARY-001</e:InvoiceNumber>",
      "<e:InvoiceNumber>ORDINARY-001</e:InvoiceNumber><e:InvoiceTypeCode>10</e:InvoiceTypeCode>",
    );
    expect(new XmlInvoiceParser().parse(Buffer.from(special)).invoiceType).toBe("SPECIAL");
    expect(new XmlInvoiceParser().parse(Buffer.from(ordinary)).invoiceType).toBe("ORDINARY");
  });

  it("classifies digital invoice, legacy FPLXDM and special-invoice flag variants", () => {
    const cases = [
      ["DIGITAL-SPECIAL", "<e:InvoiceTypeCode>20</e:InvoiceTypeCode>", "SPECIAL"],
      ["DIGITAL-ORDINARY", "<e:InvoiceTypeCode>21</e:InvoiceTypeCode>", "ORDINARY"],
      ["LEGACY-SPECIAL", "<e:FPLXDM>004</e:FPLXDM>", "SPECIAL"],
      ["LEGACY-ORDINARY", "<e:FPLXDM>007</e:FPLXDM>", "ORDINARY"],
      ["FLAG-SPECIAL", "<e:IsSpecialInvoice>Y</e:IsSpecialInvoice>", "SPECIAL"],
      ["FLAG-ORDINARY", "<e:IsSpecialInvoice>N</e:IsSpecialInvoice>", "ORDINARY"],
    ] as const;

    for (const [number, typeField, expected] of cases) {
      const xml = invoiceXml(number).replace(
        `<e:InvoiceNumber>${number}</e:InvoiceNumber>`,
        `<e:InvoiceNumber>${number}</e:InvoiceNumber>${typeField}`,
      );
      expect(new XmlInvoiceParser().parse(Buffer.from(xml)).invoiceType).toBe(expected);
    }
  });

  it("rejects inconsistent totals", () => {
    const xml = invoiceXml().replace("<e:TotalTaxIncludedAmount>166.00", "<e:TotalTaxIncludedAmount>165.99");
    expect(() => new XmlInvoiceParser().parse(Buffer.from(xml))).toThrowError(
      expect.objectContaining({ code: "INVOICE_TOTAL_MISMATCH" }),
    );
  });

  it("supports compact timestamps and text nodes with attributes", () => {
    const xml = invoiceXml("ATTR-001")
      .replace("<e:InvoiceNumber>ATTR-001</e:InvoiceNumber>", '<e:InvoiceNumber type="normal">ATTR-001</e:InvoiceNumber>')
      .replace("2026-07-01 10:20:30", "20260701102030");
    const result = new XmlInvoiceParser().parse(Buffer.from(xml));

    expect(result.invoiceNumber).toBe("ATTR-001");
    expect(result.issueTime.getUTCFullYear()).toBe(2026);
    expect(result.issueTime.getUTCHours()).toBe(10);
  });

  it("supports official digital invoice field variants", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EInvoice><EInvoiceData>
  <SellerInformation><SellerIdNum>SELLER-ID</SellerIdNum><SellerName>Seller</SellerName></SellerInformation>
  <BuyerInformation><BuyerIdNum>BUYER-ID</BuyerIdNum><BuyerName>Buyer</BuyerName></BuyerInformation>
  <BasicInformation><TotalAmWithoutTax>32.43</TotalAmWithoutTax><TotalTaxAm>0.32</TotalTaxAm><TotalTax-includedAmount>32.75</TotalTax-includedAmount></BasicInformation>
  <IssuItemInformation><ItemName>Connection cable</ItemName><Quantity>1</Quantity><UnPrice>32.4257425742574</UnPrice><Amount>32.43</Amount><TaxRate>0.01</TaxRate><ComTaxAm>0.32</ComTaxAm><TaxClassificationCode>1090409990000000000</TaxClassificationCode></IssuItemInformation>
</EInvoiceData><TaxSupervisionInfo><InvoiceNumber>TEST-INVOICE-NUMBER-001</InvoiceNumber><IssueTime>2026-06-04</IssueTime><GeneralOrSpecialVAT><LabelCode>02</LabelCode><LabelName>\u666E\u901A\u53D1\u7968</LabelName></GeneralOrSpecialVAT></TaxSupervisionInfo></EInvoice>`;

    const result = new XmlInvoiceParser().parse(Buffer.from(xml));

    expect(result).toMatchObject({
      invoiceType: "ORDINARY",
      invoiceNumber: "TEST-INVOICE-NUMBER-001",
      totalTaxIncludedAmount: "32.75",
      items: [{ unitPrice: "32.425743", taxAmount: "0.32" }],
    });

    const special = xml.replace("<LabelCode>02</LabelCode><LabelName>\u666E\u901A\u53D1\u7968</LabelName>", "<LabelCode>01</LabelCode><LabelName>\u589E\u503C\u7A0E\u4E13\u7528\u53D1\u7968</LabelName>");
    expect(new XmlInvoiceParser().parse(Buffer.from(special)).invoiceType).toBe("SPECIAL");
  });

  it("uses RequestTime when the invoice format provides the precise issuance timestamp", () => {
    const xml = invoiceXml("REQUEST-TIME-001").replace(
      "<e:IssueTime>2026-07-01 10:20:30</e:IssueTime>",
      "<e:IssueTime>2026-07-01</e:IssueTime><e:RequestTime>2026-07-01 14:12:43</e:RequestTime>",
    );
    const result = new XmlInvoiceParser().parse(Buffer.from(xml));
    expect(result.issueTime.toISOString()).toBe("2026-07-01T14:12:43.000Z");
  });

  it("rejects documents containing a DOCTYPE", () => {
    const xml = invoiceXml().replace("<e:ElectronicInvoice", "<!DOCTYPE invoice><e:ElectronicInvoice");
    expect(() => new XmlInvoiceParser().parse(Buffer.from(xml))).toThrowError(
      expect.objectContaining({ code: "UNSAFE_INVOICE_XML" }),
    );
  });
});
