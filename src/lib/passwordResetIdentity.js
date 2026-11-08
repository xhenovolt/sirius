export function normalizeUgandaPhone(phone) {
  const value = String(phone || "").replace(/[\s().-]/g, "");
  if (/^07\d{8}$/.test(value)) return `+256${value.slice(1)}`;
  if (/^2567\d{8}$/.test(value)) return `+${value}`;
  if (/^\+2567\d{8}$/.test(value)) return value;
  return null;
}

export function passwordResetPhoneLookupValues(phone) {
  const normalized = normalizeUgandaPhone(phone);
  if (!normalized) return [];
  return [normalized.slice(1), `0${normalized.slice(4)}`];
}

export function uniquePasswordResetUser(rows) {
  return rows.length === 1 ? rows[0] : null;
}
