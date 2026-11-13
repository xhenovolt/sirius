import { getDb } from "./db.js";
import { queryTenant, queryTenantOne } from "./dbTenant.js";
import { resolveToken } from "./identity.js";

const publicVerificationLimit = 60;

export function kampalaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function decimalCents(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? "0"));
  if (!match) throw new Error("Invalid decimal amount in clearance data.");
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0") || "0");
  return match[1] ? -cents : cents;
}

function dateOnly(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function computeClearance({
  balance,
  currentDate,
  allowance = null,
  rules = [],
  className = null,
  currentTerm = null,
}) {
  if (allowance && !allowance.revoked_at && dateOnly(allowance.allowed_until) >= currentDate) {
    return {
      verdict: "ALLOWED",
      reason: allowance.reason,
      allowedUntil: dateOnly(allowance.allowed_until),
      grantedBy: allowance.granted_by,
      grantedAt: allowance.granted_at,
      basis: "allowance",
    };
  }

  const balanceCents = decimalCents(balance);
  const applicableRule = rules.find((rule) =>
    (!rule.expires_at || dateOnly(rule.expires_at) >= currentDate)
    && (!rule.class_name || rule.class_name === className)
    && (!rule.term || rule.term === currentTerm)
    && balanceCents <= decimalCents(rule.threshold));
  if (applicableRule) {
    return {
      verdict: "ALLOWED",
      reason: "Balance is within the active threshold.",
      threshold: String(applicableRule.threshold),
      allowedUntil: applicableRule.expires_at ? dateOnly(applicableRule.expires_at) : null,
      basis: "threshold",
    };
  }
  if (balanceCents === 0n) {
    return { verdict: "CLEARED", reason: "No outstanding fee balance.", basis: "zero-balance" };
  }
  return { verdict: "NOT CLEARED", reason: "Outstanding fee balance exceeds the applicable threshold.", basis: "balance" };
}

export async function getStudentsForClearanceCards(schoolId) {
  const today = kampalaDate();
  const [studentResult, allowanceResult, ruleResult] = await Promise.all([
    queryTenant(
      schoolId,
      `SELECT s.id, s.student_uid, s.student_account_no, s.full_name, s.class_name,
              s.stream, s.student_type, s.photo_url, s.fee_balance,
              sc.school_name, sc.contact_phone, sc.logo_url, sc.current_term
         FROM students s
         JOIN schools sc ON sc.school_id = s.school_id
        WHERE s.school_id = ? AND s.status = 'active'
        ORDER BY s.full_name ASC
        LIMIT 500`,
      [schoolId],
    ),
    queryTenant(
      schoolId,
      `SELECT student_id, allowed_until, reason, granted_by, granted_at, revoked_at
         FROM clearance_allowances
        WHERE school_id = ? AND revoked_at IS NULL AND allowed_until >= ?
        ORDER BY allowed_until DESC, granted_at DESC`,
      [schoolId, today],
    ),
    queryTenant(
      schoolId,
      `SELECT threshold, class_name, term, expires_at
         FROM clearance_threshold_rules
        WHERE school_id = ? AND is_active = 1
          AND (expires_at IS NULL OR expires_at >= ?)`,
      [schoolId, today],
    ),
  ]);
  const [students] = studentResult;
  const [allowances] = allowanceResult;
  const [rules] = ruleResult;
  const allowanceByStudent = new Map();
  for (const allowance of allowances) {
    if (!allowanceByStudent.has(String(allowance.student_id))) {
      allowanceByStudent.set(String(allowance.student_id), allowance);
    }
  }
  return students.map((student) => {
    const clearance = computeClearance({
      balance: student.fee_balance,
      currentDate: today,
      allowance: allowanceByStudent.get(String(student.id)) || null,
      rules,
      className: student.class_name,
      currentTerm: student.current_term,
    });
    const reportType = clearance.verdict === "CLEARED"
      ? "permanent"
      : clearance.verdict === "ALLOWED" ? "temporary" : null;
    return {
      id: student.id,
      student_uid: student.student_uid,
      student_account_no: student.student_account_no,
      full_name: student.full_name,
      class_name: student.class_name,
      stream: student.stream,
      student_type: student.student_type,
      fee_balance: student.fee_balance,
      photo_url: student.photo_url,
      school_name: student.school_name,
      contact_phone: student.contact_phone,
      school_logo_url: student.logo_url,
      current_term: student.current_term,
      clearance_report_type: reportType,
      clearance_verdict: clearance.verdict,
      clearance_deadline: clearance.allowedUntil || "",
      issued_on: today,
    };
  });
}

async function writeScanEvent({ identity, outcome, ipAddress, userAgent, studentId = null }) {
  await getDb().query(
    `INSERT INTO scan_events (qr_identity_id, student_id, school_id, outcome, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      identity?.id || null,
      studentId,
      identity?.school_id || null,
      outcome,
      ipAddress,
      userAgent,
    ],
  );
}

export function shapePublicStudent(row, clearance) {
  return {
    full_name: row.full_name,
    photo_url: row.photo_url,
    class_name: row.class_name,
    school_name: row.registered_school_name || row.school_name || "School",
    data_as_of: row.data_as_of,
    clearance: { verdict: clearance.verdict },
  };
}

export function shapeFullStudent(row, clearance) {
  return {
    student_account_no: row.student_account_no,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: row.full_name,
    gender: row.gender,
    class_name: row.class_name,
    stream: row.stream,
    photo_url: row.photo_url,
    parent_name: row.parent_name,
    parent_phone: row.parent_phone,
    fee_balance: row.fee_balance,
    school_name: row.registered_school_name || row.school_name || "School",
    data_as_of: row.data_as_of,
    clearance,
  };
}

export async function getVerificationResult(token, { session = null, ipAddress = null, userAgent = null } = {}) {
  const ip = typeof ipAddress === "string" && ipAddress.trim() ? ipAddress.trim().slice(0, 64) : "unknown";
  const agent = typeof userAgent === "string" ? userAgent.slice(0, 255) : null;
  const db = getDb();

  const [counts] = await db.query(
    `SELECT COUNT(*) AS attempts
       FROM scan_events
      WHERE ip_address = ?
        AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE)`,
    [ip],
  );
  if (Number(counts[0]?.attempts || 0) >= publicVerificationLimit) {
    await writeScanEvent({ outcome: "rate_limited", ipAddress: ip, userAgent: agent });
    return { rateLimited: true, student: null, isFullRecord: false };
  }

  const resolution = await resolveToken(db, token);
  if (resolution.outcome !== "resolved") {
    await writeScanEvent({ identity: resolution.identity, outcome: resolution.outcome, ipAddress: ip, userAgent: agent });
    return { rateLimited: false, student: null, isFullRecord: false };
  }

  const identity = resolution.identity;
  const row = await queryTenantOne(
    identity.school_id,
    `SELECT s.student_account_no, s.first_name, s.last_name, s.full_name, s.gender,
            s.class_name, s.stream, s.photo_url, s.parent_name, s.parent_phone,
            s.fee_balance, s.updated_at AS data_as_of, s.school_name,
            sc.school_name AS registered_school_name, sc.current_term
       FROM students s
       LEFT JOIN schools sc ON sc.school_id = s.school_id
      WHERE s.school_id = ? AND s.id = ? AND s.status = 'active'
      LIMIT 1`,
    [identity.school_id, identity.student_id],
  );
  if (!row) {
    await writeScanEvent({ identity, outcome: "unknown", ipAddress: ip, userAgent: agent });
    return { rateLimited: false, student: null, isFullRecord: false };
  }

  const today = kampalaDate();
  const [allowances, rules] = await Promise.all([
    queryTenant(
      identity.school_id,
      `SELECT allowed_until, reason, granted_by, granted_at, revoked_at
         FROM clearance_allowances
        WHERE school_id = ? AND student_id = ? AND revoked_at IS NULL
          AND allowed_until >= ?
        ORDER BY allowed_until DESC, granted_at DESC
        LIMIT 1`,
      [identity.school_id, identity.student_id, today],
    ),
    queryTenant(
      identity.school_id,
      `SELECT threshold, class_name, term, expires_at
         FROM clearance_threshold_rules
        WHERE school_id = ? AND is_active = 1
          AND (expires_at IS NULL OR expires_at >= ?)`,
      [identity.school_id, today],
    ),
  ]);
  const clearance = computeClearance({
    balance: row.fee_balance,
    currentDate: today,
    allowance: allowances[0][0] || null,
    rules: rules[0],
    className: row.class_name,
    currentTerm: row.current_term,
  });
  const isFullRecord = Boolean(session?.school_id && session.school_id === identity.school_id);
  await writeScanEvent({
    identity,
    outcome: "resolved",
    ipAddress: ip,
    userAgent: agent,
    studentId: identity.student_id,
  });
  return {
    rateLimited: false,
    student: isFullRecord ? shapeFullStudent(row, clearance) : shapePublicStudent(row, clearance),
    isFullRecord,
  };
}

export async function listSchoolAllowances(schoolId, limit = 100) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT a.id, a.allowed_until, a.reason, a.granted_at,
            s.full_name, s.student_uid, s.class_name,
            u.display_name AS granted_by_name
       FROM clearance_allowances a
       JOIN students s ON s.id = a.student_id AND s.school_id = a.school_id
       LEFT JOIN users u ON u.id = a.granted_by AND u.school_id = a.school_id
      WHERE a.school_id = ? AND a.revoked_at IS NULL AND a.allowed_until >= ?
      ORDER BY a.allowed_until DESC, a.granted_at DESC
      LIMIT ?`,
    [schoolId, kampalaDate(), limit],
  );
  return rows;
}

export async function listScanEvents(schoolId, limit = 100) {
  const [rows] = await queryTenant(
    schoolId,
    `SELECT e.id, e.outcome, e.ip_address, e.created_at,
            s.full_name, s.student_uid
       FROM scan_events e
       LEFT JOIN students s ON s.id = e.student_id AND s.school_id = e.school_id
      WHERE e.school_id = ?
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ?`,
    [schoolId, limit],
  );
  return rows;
}

export async function getClearanceSummary(schoolId) {
  const today = kampalaDate();
  const [allowances, thresholds, scans] = await Promise.all([
    queryTenant(
      schoolId,
      `SELECT COUNT(*) AS n FROM clearance_allowances
        WHERE school_id = ? AND revoked_at IS NULL AND allowed_until >= ?`,
      [schoolId, today],
    ),
    queryTenant(
      schoolId,
      `SELECT COUNT(*) AS n FROM clearance_threshold_rules
        WHERE school_id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at >= ?)`,
      [schoolId, today],
    ),
    queryTenant(
      schoolId,
      `SELECT COUNT(*) AS n FROM scan_events
        WHERE school_id = ? AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)`,
      [schoolId],
    ),
  ]);
  return {
    activeAllowances: Number(allowances[0][0]?.n || 0),
    activeThresholds: Number(thresholds[0][0]?.n || 0),
    scansLast24h: Number(scans[0][0]?.n || 0),
  };
}
