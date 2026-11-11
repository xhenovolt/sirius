import Link from "next/link";
import { headers } from "next/headers";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import { getVerificationResult } from "@/lib/clearance";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sirius student verification",
  robots: { index: false, follow: false },
};

function dataDate(value) {
  if (!value) return "Unavailable";
  return new Date(value).toLocaleString("en-UG", { timeZone: "Africa/Kampala" });
}

function ClearanceStatus({ clearance, full }) {
  return (
    <div className="verification-clearance">
      <small>Clearance</small>
      <strong>{clearance.verdict}</strong>
      {full && <p>{clearance.reason}{clearance.allowedUntil ? ` · Allowed until ${clearance.allowedUntil}` : ""}</p>}
    </div>
  );
}

export default async function TokenVerificationPage({ params }) {
  const { token } = await params;
  let result = null;
  let failed = false;
  try {
    const [session, requestHeaders] = await Promise.all([getSession(), headers()]);
    result = await getVerificationResult(token, {
      session: hasSchoolPermission(session, "students.view") ? session : null,
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
        || requestHeaders.get("x-real-ip"),
      userAgent: requestHeaders.get("user-agent"),
    });
  } catch (error) {
    console.error("Token verification failed", error);
    failed = true;
  }

  const student = result?.student;
  return (
    <main className="verify-page">
      <div className="verify-brand"><span className="brand-mark">S</span><span>Sirius</span></div>
      {failed ? (
        <div className="verify-message"><strong>Verification is temporarily unavailable.</strong><p>Please try again later.</p></div>
      ) : result?.rateLimited ? (
        <div className="verify-message"><strong>Verification is temporarily limited.</strong><p>Please wait a moment and try again.</p></div>
      ) : !student ? (
        <div className="verify-message"><strong>This Sirius code is invalid or unavailable.</strong><p>Contact the school for help.</p></div>
      ) : (
        <section className="verify-card">
          <div className="verify-school">{student.school_name}</div>
          <div className="verify-status"><span>✓</span> Verified student identity</div>
          <div className="verify-profile">
            <div className="verify-photo">
              {student.photo_url ? <img src={student.photo_url} alt={`Portrait of ${student.full_name}`} /> : student.full_name.slice(0, 1)}
            </div>
            <div><p className="eyebrow">Student</p><h1>{student.full_name}</h1></div>
          </div>
          <div className="verify-details">
            <div><small>Class</small><strong>{student.class_name || "Not provided"}</strong></div>
            <div><small>Data as of</small><strong>{dataDate(student.data_as_of)}</strong></div>
            {result.isFullRecord && <>
              <div><small>Student account number</small><strong>{student.student_account_no}</strong></div>
              <div><small>Gender</small><strong>{student.gender || "Not provided"}</strong></div>
              <div><small>Fee balance</small><strong>{student.fee_balance}</strong></div>
              <div><small>Parent or guardian</small><strong>{student.parent_name || "Not provided"}</strong></div>
              <div><small>Parent contact</small><strong>{student.parent_phone || "Not provided"}</strong></div>
            </>}
          </div>
          <ClearanceStatus clearance={student.clearance} full={result.isFullRecord} />
          <p className="verify-note">This verification shows the student&apos;s live record. Contact the school if any information appears incorrect.</p>
        </section>
      )}
      <footer>Sirius by Xhenvolt · <Link href="/about">About</Link></footer>
    </main>
  );
}
