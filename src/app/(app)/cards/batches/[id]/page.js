import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function CardBatchPage({ params }) {
  const session = await getSession();
  if (!hasSchoolPermission(session, "cards.view")) return <AccessDenied />;
  const { id } = await params;
  return (
    <main className="dashboard cards-page">
      <PageHeader eyebrow="Card production" title={`Print batch #${id}`} intro="Select exactly which cards to print, then export with crop marks." />
      <EmptyState title="Selective print batches arrive in Phase 5." actionHref="/cards" actionLabel="Go to card generation">
        This route will hold the chosen cards, N-up layout and browser print / PDF export. Until then, print cards from the card production page.
      </EmptyState>
    </main>
  );
}