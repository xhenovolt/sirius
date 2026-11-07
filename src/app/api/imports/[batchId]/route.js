import { NextResponse } from "next/server";
import { ImportError, commitImportBatch, getImportBatch, listImportRows, updateImportRows } from "@/lib/imports";
import { getSession } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

async function readBatchId(params) {
  const { batchId } = await params;
  const id = Number(batchId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function loadBatch(session, batchId, { page, pageSize, filter }) {
  const batch = await getImportBatch(batchId);
  if (!batch || batch.schoolId !== (session.school_id || "default")) return null;
  const list = await listImportRows(batchId, { page, pageSize, filter });
  return { batch, ...list };
}

function failure(error, fallback) {
  if (error instanceof ImportError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Student import request failed", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** GET: a page of staged rows for review. */
export async function GET(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const batchId = await readBatchId(params);
  if (!batchId) return NextResponse.json({ error: "Invalid import batch." }, { status: 400 });

  try {
    const search = new URL(request.url).searchParams;
    const payload = await loadBatch(session, batchId, {
      page: search.get("page"),
      pageSize: search.get("pageSize"),
      filter: search.get("filter"),
    });
    if (!payload) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    return failure(error, "Unable to load the import batch.");
  }
}

/** PATCH: save corrections to staged rows, then revalidate the batch. */
export async function PATCH(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const batchId = await readBatchId(params);
  if (!batchId) return NextResponse.json({ error: "Invalid import batch." }, { status: 400 });

  try {
    const body = await request.json();
    await updateImportRows(batchId, body?.rows);
    const search = new URL(request.url).searchParams;
    const payload = await loadBatch(session, batchId, {
      page: body?.page ?? search.get("page"),
      pageSize: body?.pageSize ?? search.get("pageSize"),
      filter: body?.filter ?? search.get("filter"),
    });
    if (!payload) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
    return NextResponse.json(payload);
  } catch (error) {
    return failure(error, "Unable to save the reviewed rows.");
  }
}

/** POST: commit the staged batch into students. */
export async function POST(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const batchId = await readBatchId(params);
  if (!batchId) return NextResponse.json({ error: "Invalid import batch." }, { status: 400 });

  try {
    const result = await commitImportBatch(batchId, session.school_id || "default");
    await recordAuditLog({
      session,
      request,
      action: "import.committed",
      entityType: "import_batch",
      entityId: String(batchId),
      details: { imported: result.imported, skipped: result.skipped },
    });
    return NextResponse.json(result);
  } catch (error) {
    return failure(error, "Unable to commit the import.");
  }
}
