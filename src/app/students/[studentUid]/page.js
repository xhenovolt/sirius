import Link from "next/link";
import { getStudentByUid } from "@/lib/students";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import LogoutButton from "../../LogoutButton";
import PhotoUpload from "./PhotoUpload";
import StudentEditor from "./StudentEditor";
import ClearanceAllowance from "./ClearanceAllowance";
import AccessDenied from "../../AccessDenied";
import { hasSchoolPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({ params }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasSchoolPermission(session, "students.view")) return <AccessDenied />;
  const canManageStudents = hasSchoolPermission(session, "students.manage");
  const canManageClearance = hasSchoolPermission(session, "clearance.manage");
  const { studentUid } = await params;
  let student = null;
  let databaseError = false;

  try {
    student = await getStudentByUid(session.school_id, studentUid);
  } catch (error) {
    console.error("Student profile load failed", error);
    databaseError = true;
  }

  return (
    <div className="app-shell">
      <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link><nav className="main-nav" aria-label="Main navigation">{hasSchoolPermission(session, "dashboard.view") && <Link href="/">Overview</Link>}<Link className="active" href="/students">Students</Link>{hasSchoolPermission(session, "imports.view") && <Link href="/import">Imports</Link>}{hasSchoolPermission(session, "cards.view") && <Link href="/cards">Cards</Link>}</nav><LogoutButton /></header>
      <main className="dashboard profile-page">
        <Link className="back-link" href="/students">← Back to students</Link>
        {databaseError ? <div className="empty-state"><strong>Unable to connect to student records.</strong><p>Please try again.</p></div> : !student ? <div className="empty-state"><strong>Student not found.</strong><p>This Sirius code does not match an active student record.</p></div> : <><section className="profile-card"><div className="profile-photo">{student.photo_url ? <img src={student.photo_url} alt={`Portrait of ${student.full_name}`} /> : student.full_name.slice(0, 1)}{canManageStudents && <PhotoUpload studentUid={student.student_uid} />}</div><div className="profile-heading"><p className="eyebrow">Student profile</p><h1>{student.full_name}</h1><p className="profile-id">{student.student_uid}</p>{canManageStudents && <StudentEditor student={student} />}</div><div className="profile-details"><div><small>Student account number</small><strong>{student.student_account_no}</strong></div><div><small>Class</small><strong>{student.class_name || "Not provided"}{student.stream ? ` · ${student.stream}` : ""}</strong></div><div><small>Gender</small><strong>{student.gender || "Not provided"}</strong></div><div><small>Fee balance</small><strong>{student.fee_balance}</strong></div><div><small>Parent or guardian</small><strong>{student.parent_name || "Not provided"}</strong></div><div><small>Parent contact</small><strong>{student.parent_phone || "Not provided"}</strong></div><div><small>School</small><strong>{student.registered_school_name || student.school_name || "Not provided"}</strong></div></div></section>{canManageClearance && <ClearanceAllowance studentUid={student.student_uid} />}</>}
      </main>
    </div>
  );
}
