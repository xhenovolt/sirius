import Link from "next/link";
import { getPublicStudentByUid } from "@/lib/students";

export const dynamic = "force-dynamic";

export default async function PublicStudentVerification({ params }) {
  const { studentUid } = await params;
  let student = null;
  let failed = false;
  try { student = await getPublicStudentByUid(studentUid); } catch (error) { console.error("Public verification failed", error); failed = true; }
  return <main className="verify-page"><div className="verify-brand"><span className="brand-mark">S</span><span>Sirius</span></div>{failed ? <div className="verify-message"><strong>Student records are temporarily unavailable.</strong><p>Please try again.</p></div> : !student ? <div className="verify-message"><strong>Student not found.</strong><p>This Sirius code does not match a student record.</p></div> : <section className="verify-card"><div className="verify-school">{student.school_name || student.registered_school_name || "School"}</div><div className="verify-status"><span>✓</span> Verified student identity</div><div className="verify-profile"><div className="verify-photo">{student.photo_url ? <img src={student.photo_url} alt={`Portrait of ${student.full_name}`} /> : student.full_name.slice(0, 1)}</div><div><p className="eyebrow">Student</p><h1>{student.full_name}</h1></div></div><div className="verify-details"><div><small>Class</small><strong>{student.class_name || "Not provided"}{student.stream ? ` · ${student.stream}` : ""}</strong></div><div><small>Data as of</small><strong>{new Date(student.data_as_of).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}</strong></div></div><p className="verify-note">This identity was verified by Sirius. Contact the school if any information appears incorrect.</p></section>}<footer>Sirius by Xhenvolt · <Link href="/about">About</Link></footer></main>;
}