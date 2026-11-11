import Link from "next/link";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { getImportBatch } from "@/lib/imports";
import AccessDenied from "@/components/shell/AccessDenied";
import EmptyState from "@/components/shell/EmptyState";
import ImportClient from "../new/ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportBatchPage({ params }) {
  const session = await getSession();
  if (!hasSchoolPermission(session, "imports.view")) return <AccessDenied />;
  const { batchId } = await params;
  if (!/^\d+$/.test(batchId)) {
    return <main className="dashboard"><EmptyState title="Import not found." actionHref="/imports" actionLabel="Back to import history">This import reference is not valid.</EmptyState></main>;
  }
  let batch = null;
  try {
    batch = await getImportBatch(batchId, session.school_id);
  } catch (error) {
    console.error("Import batch lookup failed", error);
  }
  if (!batch) {
    return <main className="dashboard"><EmptyState title="Import not found." actionHref="/imports" actionLabel="Back to import history">This import does not exist in your school.</EmptyState></main>;
  }
  return <ImportClient canManage={hasSchoolPermission(session, "imports.manage")} initialBatchId={batchId} />;
}