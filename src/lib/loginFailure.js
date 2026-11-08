export function getLoginFailureReason(user, passwordMatches) {
  if (!user) return "account_not_found";
  if (user.status !== "active") return "account_inactive";
  if (!passwordMatches) return "password_mismatch";
  return null;
}
