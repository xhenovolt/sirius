import { getSession, hasSchoolPermission } from "@/lib/auth";
import AccessDenied from "@/components/shell/AccessDenied";
import PageHeader from "@/components/shell/PageHeader";
import StudentCreateForm from "../StudentCreateForm";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const session = await getSession();
  if (!hasSchoolPermission(session, "students.manage")) return <AccessDenied />;
  return (
    <main className="dashboard students-page">
      <PageHeader eyebrow="Student records" title="Add a student" intro="Create a single learner record. The student account number must be unique within your school." />
      <StudentCreateForm open />
    </main>
  );
}