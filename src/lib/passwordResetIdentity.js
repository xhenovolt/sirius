export function uniquePasswordResetUser(rows) {
  return rows.length === 1 ? rows[0] : null;
}
