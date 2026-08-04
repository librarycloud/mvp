export function invoiceXml(invoiceNumber = "INV-2026-0001") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:ElectronicInvoice xmlns:e="urn:example:invoice">
  <e:SellerInformation>
    <e:SellerName>示例科技有限公司</e:SellerName>
    <e:SellerIdNum>91310000SELLER001</e:SellerIdNum>
  </e:SellerInformation>
  <e:BuyerInformation>
    <e:BuyerName>购买方有限公司</e:BuyerName>
    <e:BuyerIdNum>91310000BUYER001</e:BuyerIdNum>
  </e:BuyerInformation>
  <e:BasicInformation>
    <e:InvoiceNumber>${invoiceNumber}</e:InvoiceNumber>
    <e:IssueTime>2026-07-01 10:20:30</e:IssueTime>
    <e:TotalAmWithoutTax>150.00</e:TotalAmWithoutTax>
    <e:TotalTaxAm>16.00</e:TotalTaxAm>
    <e:TotalTaxIncludedAmount>166.00</e:TotalTaxIncludedAmount>
    <e:Currency>CNY</e:Currency>
  </e:BasicInformation>
  <e:IssuItemInformation>
    <e:Item>
      <e:ItemName>软件服务</e:ItemName>
      <e:Specification>标准版</e:Specification>
      <e:Unit>项</e:Unit>
      <e:Quantity>1</e:Quantity>
      <e:UnitPrice>100.00</e:UnitPrice>
      <e:Amount>100.00</e:Amount>
      <e:TaxRate>13%</e:TaxRate>
      <e:TaxAmount>13.00</e:TaxAmount>
      <e:TaxClassificationCode>304020101</e:TaxClassificationCode>
    </e:Item>
    <e:Item>
      <e:ItemName>技术支持</e:ItemName>
      <e:Quantity>1</e:Quantity>
      <e:UnitPrice>50.00</e:UnitPrice>
      <e:Amount>50.00</e:Amount>
      <e:TaxRate>0.06</e:TaxRate>
      <e:TaxAmount>3.00</e:TaxAmount>
      <e:TaxClassificationCode>304020102</e:TaxClassificationCode>
    </e:Item>
  </e:IssuItemInformation>
  <e:TaxSupervisionInfo><e:MachineCode>MACHINE-001</e:MachineCode></e:TaxSupervisionInfo>
</e:ElectronicInvoice>`;
}
