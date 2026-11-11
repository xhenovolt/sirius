import Link from "next/link";

export const metadata = { title: "Documentation | Sirius" };

const excelColumns = [
  { name: "student_account_no", required: true, description: "Student number provided by the school; Sirius never generates it.", example: "JIPRA-2026-001" },
  { name: "first_name", required: true, description: "Student's first name.", example: "Amina" },
  { name: "last_name", required: true, description: "Student's last name.", example: "Njoroge" },
  { name: "gender", required: false, description: "Student's gender.", example: "Female" },
  { name: "class_name", required: false, description: "Student's class or grade.", example: "Form 2" },
  { name: "stream", required: false, description: "Student's stream or section.", example: "East" },
  { name: "photo_url", required: false, description: "URL for the student's photo.", example: "https://example.com/photos/amina.jpg" },
  { name: "parent_name", required: false, description: "Parent or guardian name.", example: "Mary Njoroge" },
  { name: "parent_phone", required: false, description: "Parent or guardian phone number.", example: "+254700000000" },
];

const excelAliases = [
  { column: "student_account_no", aliases: "admission_number, admission, Admission Number" },
  { column: "first_name", aliases: "firstName, First Name" },
  { column: "last_name", aliases: "lastName, Last Name" },
  { column: "class_name", aliases: "class, Class" },
  { column: "photo_url", aliases: "photo, Photo" },
  { column: "parent_name", aliases: "parent, Parent Name" },
  { column: "parent_phone", aliases: "parentPhone, Parent Phone" },
  { column: "gender", aliases: "Gender" },
  { column: "stream", aliases: "Stream" },
];

export default function DocumentationPage() {
  return (
    <main className="info-page">
      <div className="info-nav">
        <Link className="brand" href="/"><span className="brand-mark">S</span><span>Sirius</span></Link>
        <Link className="text-link" href="/about">About Sirius →</Link>
      </div>
      <section className="docs-content">
        <p className="eyebrow">Operations guide</p>
        <h1>Documentation</h1>
        <p className="intro-copy">The essential workflow for running Sirius at your school, and everything you need to know about its data and activity records.</p>
        <div className="docs-list">
          <article><span>01</span><div><h2>Import records</h2>          <p>Open Import, upload an `.xlsx`, `.xls`, or `.csv` file, review validation results, and commit valid rows. Student account number, first name, and last name are required. See the full spreadsheet structure below.</p></div></article>
          <article><span>02</span><div><h2>Add photos</h2><p>Open a student profile and upload a JPEG, PNG, or WebP image. Photos are stored securely in Cloudinary and used on profiles and cards.</p></div></article>
          <article><span>03</span><div><h2>Print cards</h2><p>Open Cards to create stable QR codes and print card-ready layouts. A QR payload contains only the student&apos;s Sirius ID.</p></div></article>
          <article><span>04</span><div><h2>Scan and identify</h2><p>Open Scan and use the camera or a USB scanner. Sirius looks up the ID and displays the learner profile.</p></div></article>
          <article><span>05</span><div><h2>Manage access</h2><p>Administrators can open Settings to update school details, review users, see presence, disable accounts, and end user sessions.</p></div></article>
          <article><span>06</span><div><h2>Review activity</h2><p>Every sign-in, import, photo change, and settings change is written to an audit log. Administrators can review who did what, and when, from the Audit log panel in Settings.</p></div></article>
        </div>

        <div className="docs-list" id="excel-format">
          <article>
            <span>07</span>
            <div>
              <h2>Excel import file structure</h2>
              <p>Sirius imports student records from `.xlsx`, `.xls`, and `.csv` files. Put the column headings in the first row and put one student per row below them. Header names are case-sensitive, so use the standard `snake_case` headings below for the most reliable result.</p>
              <div className="docs-table-wrap">
                <table className="docs-table">
                  <thead><tr><th>Column</th><th>Required</th><th>Description</th><th>Example</th></tr></thead>
                  <tbody>
                    {excelColumns.map((column) => (
                      <tr key={column.name}><td>{column.name}</td><td>{column.required ? "Yes" : "No"}</td><td>{column.description}</td><td>{column.example}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>A row is skipped during import if <code>student_account_no</code>, <code>first_name</code>, or <code>last_name</code> is missing. Student account numbers must be unique within the file and school; existing students with the same number are updated instead of duplicated. Leading and trailing spaces in cell values are removed, and the importer previews all rows first, importing only valid rows once you confirm.</p>
              <p>Sirius also recognizes these alternative column headings:</p>
              <div className="docs-table-wrap">
                <table className="docs-table">
                  <thead><tr><th>Standard column</th><th>Accepted alternatives</th></tr></thead>
                  <tbody>
                    {excelAliases.map((alias) => (
                      <tr key={alias.column}><td>{alias.column}</td><td>{alias.aliases}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </article>

          <article>
            <span>08</span>
            <div>
              <h2>Audit log</h2>
              <p>Sirius keeps a record of key actions so administrators can track what happened in the system: sign-ins and failed sign-in attempts, sign-outs, account requests, password reset requests, spreadsheet imports, photo updates, school and logo settings changes, and user management actions such as creating, promoting, disabling, or logging out a user. Each entry stores who performed the action, what it affected, and when. Administrators can review the most recent activity from the Audit log panel on the Settings page.</p>
            </div>
          </article>
        </div>
      </section>
      <footer className="info-footer">Sirius by Xhenvolt · <Link href="/about">About</Link></footer>
    </main>
  );
}
