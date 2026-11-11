const actionLabels = {
  "login.success": "Signed in",
  "login.failed": "Failed sign-in attempt",
  logout: "Signed out",
  signup: "Account requested",
  "password_reset.requested": "Password reset requested",
  "password_reset.completed": "Password reset completed",
  "import.committed": "Imported students",
  "student.photo_updated": "Updated student photo",
  "school.logo_updated": "Updated school logo",
  "school.settings_updated": "Updated school settings",
  "user.created": "Created a user",
  "user.promote": "Promoted a user to admin",
  "user.demote": "Demoted a user to operator",
  "user.disable": "Disabled a user",
  "user.enable": "Enabled a user",
  "user.logout": "Ended a user's sessions",
};

export default function AuditLogPanel({ logs }) {
  return (
    <section className="panel settings-panel audit-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Accountability</p>
          <h2>Audit log</h2>
        </div>
        <span className="preview-count">{logs.length} recent event{logs.length === 1 ? "" : "s"}</span>
      </div>
      {logs.length === 0 ? (
        <p className="empty-inline" style={{ padding: "0 25px 20px" }}>No activity recorded yet.</p>
      ) : (
        <div className="user-list audit-list">
          {logs.map((log) => (
            <div className="user-row audit-row" key={log.id}>
              <span className="avatar">{(log.actor_email || "?").slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{actionLabels[log.action] || log.action}</strong>
                <small>{log.actor_email || "System"}{log.entity_id ? ` · ${log.entity_type || "entity"}: ${log.entity_id}` : ""}</small>
                <small>{new Date(log.created_at).toLocaleString()}{log.ip_address ? ` · ${log.ip_address}` : ""}</small>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
