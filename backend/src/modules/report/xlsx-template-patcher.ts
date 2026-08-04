import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export type XlsxCellValues = ReadonlyMap<string, string | number>;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function array<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function setAttribute(attributes: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${name}="[^"]*"`, "g");
  return `${attributes.replace(pattern, "")} ${name}="${value}"`;
}

export class XlsxTemplatePatcher {
  async fill(templatePath: string, sheetName: string, values: XlsxCellValues): Promise<Buffer> {
    const zip = await JSZip.loadAsync(await fs.readFile(templatePath));
    const workbookXml = await this.read(zip, "xl/workbook.xml");
    const relationshipsXml = await this.read(zip, "xl/_rels/workbook.xml.rels");
    const sheetPath = this.sheetPath(workbookXml, relationshipsXml, sheetName);
    let sheetXml = await this.read(zip, sheetPath);
    for (const [address, value] of values) sheetXml = this.replaceCell(sheetXml, address, value);
    zip.file(sheetPath, sheetXml);
    zip.file("xl/workbook.xml", this.enableRecalculation(workbookXml));
    await this.removeCalculationChain(zip, relationshipsXml);
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  private async read(zip: JSZip, fileName: string): Promise<string> {
    const file = zip.file(fileName);
    if (!file) throw new Error(`XLSX template is missing ${fileName}`);
    return file.async("string");
  }

  private sheetPath(workbookXml: string, relationshipsXml: string, sheetName: string): string {
    const workbook = parser.parse(workbookXml) as {
      workbook?: { sheets?: { sheet?: Array<Record<string, string>> | Record<string, string> } };
    };
    const sheet = array(workbook.workbook?.sheets?.sheet).find((item) => item["@_name"] === sheetName);
    const relationshipId = sheet?.["@_r:id"];
    if (!relationshipId) throw new Error(`XLSX template is missing worksheet ${sheetName}`);
    const relationships = parser.parse(relationshipsXml) as {
      Relationships?: { Relationship?: Array<Record<string, string>> | Record<string, string> };
    };
    const relationship = array(relationships.Relationships?.Relationship).find((item) => item["@_Id"] === relationshipId);
    const target = relationship?.["@_Target"];
    if (!target) throw new Error(`XLSX template worksheet relationship is missing for ${sheetName}`);
    return target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join("xl", target));
  }

  private replaceCell(xml: string, address: string, value: string | number): string {
    const escapedAddress = address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fullCell = new RegExp(`<c\\b([^>]*\\br="${escapedAddress}"[^>]*)>([\\s\\S]*?)<\\/c>`);
    const selfClosingCell = new RegExp(`<c\\b([^>]*\\br="${escapedAddress}"[^>]*)\\/>`);
    const content = this.cellContent(value);
    const selfClosingMatch = selfClosingCell.exec(xml);
    if (selfClosingMatch) {
      const attributes = this.cellAttributes(selfClosingMatch[1]!, typeof value === "string");
      return `${xml.slice(0, selfClosingMatch.index)}<c${attributes}>${content}</c>${xml.slice(selfClosingMatch.index + selfClosingMatch[0].length)}`;
    }
    const fullMatch = fullCell.exec(xml);
    if (fullMatch) {
      const attributes = this.cellAttributes(fullMatch[1]!, typeof value === "string");
      return `${xml.slice(0, fullMatch.index)}<c${attributes}>${content}</c>${xml.slice(fullMatch.index + fullMatch[0].length)}`;
    }
    throw new Error(`XLSX template is missing target cell ${address}`);
  }

  private cellAttributes(attributes: string, text: boolean): string {
    const withoutType = attributes.replace(/\s+t="[^"]*"/g, "");
    return text ? `${withoutType} t="inlineStr"` : withoutType;
  }

  private cellContent(value: string | number): string {
    return typeof value === "string"
      ? `<is><t xml:space="preserve">${xmlText(value)}</t></is>`
      : `<v>${String(value)}</v>`;
  }

  private enableRecalculation(xml: string): string {
    const pattern = /<calcPr\b([^>]*)\/>/;
    const match = pattern.exec(xml);
    if (!match) return xml.replace("</workbook>", '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
    let attributes = match[1]!;
    attributes = setAttribute(attributes, "calcMode", "auto");
    attributes = setAttribute(attributes, "fullCalcOnLoad", "1");
    attributes = setAttribute(attributes, "forceFullCalc", "1");
    return xml.replace(pattern, `<calcPr${attributes}/>`);
  }

  private async removeCalculationChain(zip: JSZip, relationshipsXml: string): Promise<void> {
    zip.remove("xl/calcChain.xml");
    zip.file("xl/_rels/workbook.xml.rels", relationshipsXml.replace(/<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g, ""));
    const contentTypes = zip.file("[Content_Types].xml");
    if (contentTypes) {
      const xml = await contentTypes.async("string");
      zip.file("[Content_Types].xml", xml.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, ""));
    }
  }
}
