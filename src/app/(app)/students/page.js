import Link from "next/link";
import { searchStudents } from "@/lib/students";
import { getSession, hasSchoolPermission } from "@/lib/auth";
import StudentCreateForm from "./StudentCreateForm";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import EmptyState from "@/components/shell/EmptyState";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }) {
  const session = await getSession();
  if (!hasSchoolPermission(session, "students.view")) return <AccessDenied />;
  const canManageStudents = hasSchoolPermission(session, "students.manage");
  const canManageImports = hasSchoolPermission(session, "imports.manage");
  const params = await searchParams;
  const search = typeof params?.search === "string" ? params.search : "";
  let students = [];
  let databaseError = false;

  try {
    students = await searchStudents(session.school_id, search);
  } catch (error) {
    console.error("Students page load failed", error);
    databaseError = true;
  }

  return (
    <main className="dashboard students-page">
      <PageHeader
        eyebrow="Student records"
        title="Students"
        intro="Search and manage the learners in your school."
        actions={canManageImports ? <Link className="button button-primary" href="/imports/new"><span>+</span> Import students</Link> : null}
      />
      {canManageStudents && <StudentCreateForm />}
      <form className="search-bar" method="get">
        <span className="search-icon">⌕</span><input name="search" defaultValue={search} placeholder="Search by name, student account number or Sirius ID" aria-label="Search students" /><button type="submit">Search</button>
      </form>
      {databaseError ? <EmptyState title="Unable to connect to student records.">Please check the database connection and try again.</EmptyState> : students.length === 0 ? <EmptyState title="No students found." actionHref={canManageImports ? "/imports/new" : null} actionLabel={canManageImports ? "Import students" : null}>Try a different search or import a spreadsheet.</EmptyState> : <div className="student-table">{students.map((student) => <Link className="student-row" href={`/students/${encodeURIComponent(student.student_uid)}`} key={student.id}><span className="student-avatar">{student.full_name.slice(0, 1)}</span><span className="student-name"><strong>{student.full_name}</strong><small>{student.student_account_no} · {student.student_uid}</small></span><span className="student-class">{student.class_name || "No class"}{student.stream ? ` · ${student.stream}` : ""}</span><span className="status"><i />Active</span></Link>)}</div>}
    </main>
  );
}