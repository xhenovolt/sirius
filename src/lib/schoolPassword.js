import { getSchoolPasswordPolicy } from "./control/platform-settings.js";
import { schoolPasswordPolicyError } from "./passwordPolicyRules.js";

export async function assertSchoolPassword(password) {
  const policy = await getSchoolPasswordPolicy();
  const reason = schoolPasswordPolicyError(password, policy);
  if (!reason) return;

  const error = new Error(reason);
  error.code = "INVALID_SCHOOL_PASSWORD";
  error.status = 400;
  throw error;
}
