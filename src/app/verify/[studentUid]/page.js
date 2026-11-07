import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function PublicStudentVerification() {
  return <main className="verify-page"><div className="verify-brand"><span className="brand-mark">S</span><span>Sirius</span></div><div className="verify-message"><strong>This Sirius code is invalid or unavailable.</strong><p>Contact the school for help.</p></div><footer>Sirius by Xhenvolt · <Link href="/about">About</Link></footer></main>;
}