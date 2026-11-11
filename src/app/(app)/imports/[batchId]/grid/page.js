import { redirect } from "next/navigation";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "@/components/shell/AccessDenied";

export const dynamic = "force-dynamic";

// The editable staged-row grid currently lives in the batch review page.
// A dedicated full-screen grid editor lands with the designer phases.
export default async function ImportGridPage({ params }) {
  const session = await getSession();
  if (!hasSchoolPermission(session, "imports.view")) return <AccessDenied />;
  const { batchId } = await params;
  redirect(`/imports/${encodeURIComponent(batchId)}`);
}