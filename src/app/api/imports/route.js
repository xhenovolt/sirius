import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  ImportError,
  listImportBatches,
  listImportMappingTemplates,
  saveImportMappingTemplate,
  stageImport,
} from "@/lib/imports";
import { suggestColumnMapping, validateColumnMapping } from "@/lib/importMapping";
import { requireSchoolPermission } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

async function parseSpreadsheet(buffer, fileName) {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) await workbook.csv.load(buffer);
  else await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };
  const seenHeaders = new Map();
  const headers = worksheet.getRow(1).values.slice(1).map((header, index) => {
    const base = String(header || "").trim() || `Column ${index + 1}`;
    const count = (seenHeaders.get(base) || 0) + 1;
    seenHeaders.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    if (values.some((value) => value !== null && value !== undefined && String(value).trim() !== "")) rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  });
  return { headers, rows };
}

export async function GET() {
  const session = await requireSchoolPermission("imports.view");
  if (!session) return NextResponse.json({ error: "Permission to view imports is required." }, { status: 403 });
  try {
    const [batches, templates] = await Promise.all([
      listImportBatches(session.school_id),
      listImportMappingTemplates(session.school_id),
    ]);
    return NextResponse.json({ batches, templates });
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
  const session = await requireSchoolPermission("imports.manage");
  if (!session) return NextResponse.json({ error: "Permission to manage imports is required." }, { status: 403 });

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      let body;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "The import request must contain valid JSON." }, { status: 400 });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "The import request must be a JSON object." }, { status: 400 });
      }
      if (body?.action !== "save-template") return NextResponse.json({ error: "Unsupported import request." }, { status: 400 });
      await saveImportMappingTemplate(session.school_id, body.name, body.mapping, session.id);
      return NextResponse.json({ templates: await listImportMappingTemplates(session.school_id) });
    }
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
    const parsed = await parseSpreadsheet(sourceFile, file.name);
    const mode = formData.get("mode");
    if (mode === "analyze") {
      return NextResponse.json({
        fileName: file.name,
        headers: parsed.headers,
        rowCount: parsed.rows.length,
        suggestions: suggestColumnMapping(parsed.headers, parsed.rows.slice(0, 25)),
      });
    }
    if (mode !== "stage") return NextResponse.json({ error: "Choose whether to analyze or stage the spreadsheet." }, { status: 400 });
    let mapping;
    try {
      mapping = validateColumnMapping(JSON.parse(String(formData.get("mapping") || "")), parsed.headers);
    } catch (error) {
      throw new ImportError(error.message);
    }
    const result = await stageImport({
      fileName: file.name,
      rows: parsed.rows,
      schoolId: session.school_id,
      sourceFile,
      contentType: file.type,
      mapping,
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
