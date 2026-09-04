import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { commitImport, normalizeRows } from "@/lib/imports";
import { getSession } from "@/lib/auth";

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

export async function POST(request) {
  try {
    if (!(await getSession())) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || typeof file.arrayBuffer !== "function" || !/\.(xlsx|csv)$/i.test(file.name)) {
        return NextResponse.json({ error: "Please upload an .xlsx or .csv file." }, { status: 400 });
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "The spreadsheet must be smaller than 10 MB." }, { status: 400 });
      }
      const rows = normalizeRows(await parseSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name));
      return NextResponse.json({ fileName: file.name, rows, total: rows.length, valid: rows.filter((row) => row.valid).length });
    }

    const body = await request.json();
    if (!body.fileName || !Array.isArray(body.rows) || body.rows.length > 10000) {
      return NextResponse.json({ error: "Invalid import preview." }, { status: 400 });
    }
    return NextResponse.json(await commitImport(body.fileName, normalizeRows(body.rows)));
  } catch (error) {
    console.error("Student import failed", error);
    return NextResponse.json({ error: "Unable to import spreadsheet. Please check the file format." }, { status: 500 });
  }
}