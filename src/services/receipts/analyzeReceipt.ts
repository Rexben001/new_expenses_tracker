import {
  AnalyzeExpenseCommand,
  TextractClient,
  type ExpenseDocument,
  type ExpenseField,
} from "@aws-sdk/client-textract";

export type ReceiptScanResult = {
  source: "textract";
  merchant: string | null;
  total: number | null;
  date: string | null;
  rawText: string;
  confidence: number | null;
};

const fieldTypes = {
  merchant: ["VENDOR_NAME", "REMIT_TO_NAME", "NAME"],
  total: ["TOTAL", "AMOUNT_DUE", "BALANCE_DUE"],
  date: ["INVOICE_RECEIPT_DATE", "ORDER_DATE", "DUE_DATE", "DATE"],
};

export async function analyzeReceiptImage({
  textractClient,
  imageBytes,
}: {
  textractClient: TextractClient;
  imageBytes: Uint8Array;
}): Promise<ReceiptScanResult> {
  const result = await textractClient.send(
    new AnalyzeExpenseCommand({
      Document: {
        Bytes: imageBytes,
      },
    })
  );

  const documents = result.ExpenseDocuments ?? [];
  const document = documents[0];

  const rawText = collectRawText(documents);
  const merchant =
    findSummaryValue(document, fieldTypes.merchant) ?? firstReceiptLine(rawText);
  const totalText = findSummaryValue(document, fieldTypes.total);
  const dateText = findSummaryValue(document, fieldTypes.date);

  return {
    source: "textract",
    merchant,
    total: totalText ? parseMoney(totalText) : null,
    date: dateText ? normalizeDate(dateText) : null,
    rawText,
    confidence: averageConfidence(document?.SummaryFields ?? []),
  };
}

function collectRawText(documents: ExpenseDocument[]) {
  const lines = documents.flatMap((document) =>
    (document.Blocks ?? [])
      .filter((block) => block.BlockType === "LINE" && block.Text)
      .map((block) => block.Text!.trim())
  );

  if (lines.length) return lines.join("\n");

  return documents
    .flatMap((document) => document.SummaryFields ?? [])
    .map((field) => field.ValueDetection?.Text?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function findSummaryValue(
  document: ExpenseDocument | undefined,
  types: string[]
) {
  const fields = document?.SummaryFields ?? [];
  const match = fields.find((field) =>
    types.includes(field.Type?.Text?.toUpperCase() ?? "")
  );

  return match?.ValueDetection?.Text?.trim() || null;
}

function firstReceiptLine(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

function averageConfidence(fields: ExpenseField[]) {
  const scores = fields
    .map((field) => field.ValueDetection?.Confidence)
    .filter((score): score is number => typeof score === "number");

  if (!scores.length) return null;

  return Math.round(
    scores.reduce((sum, score) => sum + score, 0) / scores.length
  );
}

function parseMoney(value: string) {
  const normalized = value.replace(/[^\d.,-]/g, "");
  if (!normalized) return null;

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  const decimalSeparator =
    lastComma > -1 && lastDot > -1
      ? lastComma > lastDot
        ? ","
        : "."
      : lastComma > -1
      ? ","
      : ".";

  const numeric =
    decimalSeparator === ","
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: string) {
  const trimmed = value.trim();

  const iso = trimmed.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return formatDateParts(iso[1], iso[2], iso[3]);

  const dayFirst = trimmed.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dayFirst) {
    const year =
      dayFirst[3].length === 2 ? `20${dayFirst[3]}` : dayFirst[3];
    return formatDateParts(year, dayFirst[2], dayFirst[1]);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null;
}

function formatDateParts(year: string, month: string, day: string) {
  const paddedMonth = month.padStart(2, "0");
  const paddedDay = day.padStart(2, "0");
  const date = new Date(`${year}-${paddedMonth}-${paddedDay}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return null;

  return `${year}-${paddedMonth}-${paddedDay}`;
}
