import Link from "next/link";
import { searchStudents } from "@/lib/students";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import LogoutButton from "../LogoutButton";
import StudentCreateForm from "./StudentCreateForm";

export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }) {
  const session = await getSession();
  if (!session) redirect("/login");
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
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/">Overview</Link><Link className="active" href="/students">Students</Link><Link href="/import">Imports</Link><Link href="/cards">Cards</Link><Link href="/settings">Settings</Link>
        </nav>
        <LogoutButton />
      </header>
      <main className="dashboard students-page">
        <div className="page-title"><div><p className="eyebrow">Student records</p><h1>Students</h1><p className="intro-copy">Search and manage the learners in your school.</p></div><Link className="button button-primary" href="/import"><span>+</span> Import students</Link></div>
        <StudentCreateForm />
        <form className="search-bar" method="get">
          <span className="search-icon">⌕</span><input name="search" defaultValue={search} placeholder="Search by name, student account number or Sirius ID" aria-label="Search students" /><button type="submit">Search</button>
        </form>
        {databaseError ? <div className="empty-state"><strong>Unable to connect to student records.</strong><p>Please check the database connection and try again.</p></div> : students.length === 0 ? <div className="empty-state"><strong>No students found.</strong><p>Try a different search or import a spreadsheet.</p></div> : <div className="student-table">{students.map((student) => <Link className="student-row" href={`/students/${encodeURIComponent(student.student_uid)}`} key={student.id}><span className="student-avatar">{student.full_name.slice(0, 1)}</span><span className="student-name"><strong>{student.full_name}</strong><small>{student.student_account_no} · {student.student_uid}</small></span><span className="student-class">{student.class_name || "No class"}{student.stream ? ` · ${student.stream}` : ""}</span><span className="status"><i />Active</span></Link>)}</div>}
      </main>
    </div>
  );
}