import Link from "next/link";

export default function EmptyState({ title, children, actionHref = null, actionLabel = null }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {actionHref && actionLabel && <Link className="button button-primary" href={actionHref}>{actionLabel}</Link>}
    </div>
  );
}