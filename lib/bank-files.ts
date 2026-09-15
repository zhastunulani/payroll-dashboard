import readXlsxFile from "read-excel-file/node";
import { getDocumentProxy } from "unpdf";
import type { BankCode, ParsedStatement } from "./bank.ts";
import { parseHalykPages, parseKaspiRows, type PdfTextItem } from "./bank-parsers.ts";

/** Reads an uploaded statement file (server side) and returns its operations with the file's own totals checked. */
export async function parseStatementFile(bank: BankCode, file: Uint8Array): Promise<ParsedStatement> {
  if (bank === "kaspi") {
    const sheets = await readXlsxFile(Buffer.from(file)) as unknown as { data: unknown[][] }[];
    const rows = sheets[0]?.data;
    if (!rows?.length) throw new Error("Excel файлы бос.");
    return parseKaspiRows(rows);
  }
  const pdf = await getDocumentProxy(file);
  const pages: PdfTextItem[][] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(content.items
      .filter((i): i is typeof i & { str: string; transform: number[]; width: number } => "str" in i && !!i.str.trim())
      .map(i => ({ str: i.str, x: i.transform[4]!, y: i.transform[5]!, w: i.width })));
  }
  return parseHalykPages(pages);
}

/** Guesses the bank from the file signature, so a wrong choice in the form is caught early. */
export function detectBank(file: Uint8Array): BankCode | null {
  if (file[0] === 0x25 && file[1] === 0x50 && file[2] === 0x44 && file[3] === 0x46) return "halyk"; // %PDF
  if (file[0] === 0x50 && file[1] === 0x4b) return "kaspi"; // zip (xlsx)
  return null;
}
