export default function AccessDenied() {
  return (
    <main className="dashboard">
      <div className="empty-state">
        <strong>Access denied.</strong>
        <p>Your school role does not have permission to view this page. Ask your SuperAdmin to update your role if you need access.</p>
      </div>
    </main>
  );
}