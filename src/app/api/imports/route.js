import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { ImportError, listImportBatches, stageImport } from "@/lib/imports";
import { getSession } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

async function parseSpreadsheet(buffer, fileName) {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) await workbook.csv.load(buffer);
  else await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const headers = worksheet.getRow(1).values.slice(1).map((header) => String(header || "").trim());
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    if (values.some((value) => value !== null && value !== undefined && String(value).trim() !== "")) rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  });
  return rows;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json({ batches: await listImportBatches(session.school_id) });
  } catch (error) {
    console.error("Import history load failed", error);
    return NextResponse.json({ error: "Unable to load import history." }, { status: 500 });
  }
}

/**
 * Stages an uploaded spreadsheet into import_rows. Nothing is written to
 * students here: the batch is reviewed, then committed from
 * /api/imports/[batchId].
 */
export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Upload the spreadsheet as form data." }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || !file.name) {
      return NextResponse.json({ error: "Please choose a spreadsheet to upload." }, { status: 400 });
    }
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      return NextResponse.json({ error: "Please upload an .xlsx or .csv file." }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "The spreadsheet must be smaller than 10 MB." }, { status: 400 });
    }

    const sourceFile = Buffer.from(await file.arrayBuffer());
    const rows = await parseSpreadsheet(sourceFile, file.name);
    const result = await stageImport({
      fileName: file.name,
      rows,
      schoolId: session.school_id,
      sourceFile,
      contentType: file.type,
      createdBy: session.id,
    });
    await recordAuditLog({
      session,
      request,
      action: "import.staged",
      entityType: "import_batch",
      entityId: String(result.batchId),
      details: { fileName: result.fileName, total: result.total, valid: result.valid, invalid: result.invalid },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ImportError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Student import staging failed", error);
    return NextResponse.json({ error: "Unable to read the spreadsheet. Please check the file format." }, { status: 500 });
  }
}
