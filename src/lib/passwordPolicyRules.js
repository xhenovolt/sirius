export const DEFAULT_SCHOOL_PASSWORD_POLICY = Object.freeze({
  minLength: 6,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
});

export const MAX_SCHOOL_PASSWORD_LENGTH = 72;

const REQUIREMENT_LABELS = {
  requireUppercase: "an uppercase letter",
  requireLowercase: "a lowercase letter",
  requireNumber: "a number",
  requireSymbol: "a symbol",
};

export function parseSchoolPasswordPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { minLength, ...requirements } = value;
  if (!Number.isInteger(minLength) || minLength < 6 || minLength > MAX_SCHOOL_PASSWORD_LENGTH) return null;
  if (Object.keys(REQUIREMENT_LABELS).some((key) => typeof requirements[key] !== "boolean")) return null;
  if (Object.keys(requirements).some((key) => !Object.hasOwn(REQUIREMENT_LABELS, key))) return null;
  return { minLength, ...requirements };
}

export function schoolPasswordPolicyError(password, policy = DEFAULT_SCHOOL_PASSWORD_POLICY) {
  if (typeof password !== "string") return "Enter a password.";

  const missing = [];
  if (password.length < policy.minLength) missing.push(`at least ${policy.minLength} characters`);
  if (policy.requireUppercase && !/[A-Z]/.test(password)) missing.push(REQUIREMENT_LABELS.requireUppercase);
  if (policy.requireLowercase && !/[a-z]/.test(password)) missing.push(REQUIREMENT_LABELS.requireLowercase);
  if (policy.requireNumber && !/[0-9]/.test(password)) missing.push(REQUIREMENT_LABELS.requireNumber);
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) missing.push(REQUIREMENT_LABELS.requireSymbol);
  if (!missing.length) return null;
  return `Password must include ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
}

export function describeSchoolPasswordPolicy(policy = DEFAULT_SCHOOL_PASSWORD_POLICY) {
  const requirements = [`at least ${policy.minLength} characters`];
  if (policy.requireUppercase) requirements.push(REQUIREMENT_LABELS.requireUppercase);
  if (policy.requireLowercase) requirements.push(REQUIREMENT_LABELS.requireLowercase);
  if (policy.requireNumber) requirements.push(REQUIREMENT_LABELS.requireNumber);
  if (policy.requireSymbol) requirements.push(REQUIREMENT_LABELS.requireSymbol);
  return `Password must include ${requirements.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
}
