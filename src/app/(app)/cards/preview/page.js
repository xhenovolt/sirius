import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function CardPreviewPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "cards.view")) return <AccessDenied />;
  return (
    <main className="dashboard cards-page">
      <PageHeader eyebrow="Card production" title="Card preview" intro="Render any template against a real student record before printing." />
      <EmptyState title="The live preview renderer arrives in Phase 2." actionHref="/cards" actionLabel="Go to card generation">
        It will use the single shared renderer with a student picker, edge-case data and overflow warnings. For now, generate and review cards on the card production page.
      </EmptyState>
    </main>
  );
}