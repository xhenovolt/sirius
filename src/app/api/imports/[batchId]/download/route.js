import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getImportSourceFile, getImportVersionRows, ImportError } from "@/lib/imports";

const columns = [
  "student_account_no",
  "first_name",
  "last_name",
  "gender",
  "class_name",
  "stream",
  "photo_url",
  "parent_name",
  "parent_phone",
];

function safeFileName(value) {
  return String(value || "import").replace(/[^\w.-]+/g, "_").slice(0, 100);
}

export async function GET(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { batchId: rawBatchId } = await params;
  const batchId = Number(rawBatchId);
  if (!Number.isInteger(batchId) || batchId < 1) {
    return NextResponse.json({ error: "Invalid import batch." }, { status: 400 });
  }

  const search = new URL(request.url).searchParams;
  try {
    if (search.get("source") === "original") {
      const source = await getImportSourceFile(batchId, session.school_id);
      if (!source) return NextResponse.json({ error: "Original import file not found." }, { status: 404 });
      return new NextResponse(source.file_data, {
        headers: {
          "Content-Type": source.content_type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safeFileName(source.file_name)}"`,
          "Cache-Control": "private, no-store",
          "X-Content-SHA256": source.sha256,
        },
      });
    }

    const versionNo = Number(search.get("version"));
    const format = search.get("format");
    if (!Number.isInteger(versionNo) || versionNo < 1 || !["csv", "xlsx"].includes(format)) {
      return NextResponse.json({ error: "Choose a valid version and csv or xlsx format." }, { status: 400 });
    }
    const rows = await getImportVersionRows(batchId, session.school_id, versionNo);
    if (!rows) return NextResponse.json({ error: "Import version not found." }, { status: 404 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Students");
    worksheet.addRow(columns);
    for (const row of rows) {
      const extracted = row.extracted || {};
      worksheet.addRow(columns.map((column) => extracted[column] ?? ""));
    }
    const content = format === "csv"
      ? await workbook.csv.writeBuffer()
      : await workbook.xlsx.writeBuffer();
    return new NextResponse(content, {
      headers: {
        "Content-Type": format === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFileName(`import-${batchId}-v${versionNo}.${format}`)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ImportError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Import download failed", error);
    return NextResponse.json({ error: "Unable to download this import version." }, { status: 500 });
  }
}
