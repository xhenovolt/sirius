import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSchoolSettings } from "@/lib/students";
import AppShell from "@/components/shell/AppShell";
import { filterNav } from "@/components/shell/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");
  let schoolName = "Your school";
  try {
    const school = await getSchoolSettings(session.school_id);
    schoolName = school?.school_name || schoolName;
  } catch {
    // The shell must render even when the school lookup fails; pages surface their own errors.
  }
  return (
    <AppShell
      nav={filterNav(session)}
      schoolName={schoolName}
      user={{ displayName: session.displayName, email: session.email, isSchoolAdmin: session.isSchoolAdmin }}
    >
      {children}
    </AppShell>
  );
}