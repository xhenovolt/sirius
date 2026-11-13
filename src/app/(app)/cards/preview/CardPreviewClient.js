"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import CardRenderer from "../CardRenderer";

function getOverflowWarnings(card) {
  const elements = [...card.querySelectorAll("[data-card-element-field]")];
  const warnings = [];
  for (const element of elements) {
    if (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2) {
      warnings.push(`${element.getAttribute("data-card-element-field")} may be clipped.`);
    }
  }

  for (let left = 0; left < elements.length; left += 1) {
    const a = elements[left];
    const aX = Number.parseFloat(a.style.left);
    const aY = Number.parseFloat(a.style.top);
    const aRight = aX + Number.parseFloat(a.style.width);
    const aBottom = aY + Number.parseFloat(a.style.height);
    for (let right = left + 1; right < elements.length; right += 1) {
      const b = elements[right];
      const bX = Number.parseFloat(b.style.left);
      const bY = Number.parseFloat(b.style.top);
      const bRight = bX + Number.parseFloat(b.style.width);
      const bBottom = bY + Number.parseFloat(b.style.height);
      if (Math.min(aRight, bRight) - Math.max(aX, bX) > 0.5
        && Math.min(aBottom, bBottom) - Math.max(aY, bY) > 0.5) {
        warnings.push(`${a.getAttribute("data-card-element-field")} overlaps ${b.getAttribute("data-card-element-field")}.`);
      }
    }
  }
  return warnings;
}

export default function CardPreviewClient({ templates, students, school }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [studentId, setStudentId] = useState(String(students[0]?.id || ""));
  const [previewQr, setPreviewQr] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [qrError, setQrError] = useState(false);
  const cardRef = useRef(null);
  const template = templates.find((item) => item.id === templateId);
  const student = students.find((item) => String(item.id) === studentId);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL("SIRIUS TEMPLATE PREVIEW ONLY", { width: 220, margin: 1 })
      .then((dataUrl) => {
        if (!cancelled) {
          setPreviewQr(dataUrl);
          setQrError(false);
        }
      })
      .catch((error) => {
        console.error("Card preview QR generation failed", error);
        if (!cancelled) setQrError(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !template || !student) return undefined;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWarnings(getOverflowWarnings(card)));
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(card);
    for (const element of card.querySelectorAll("[data-card-element-field]")) observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [template, student, school, previewQr]);

  if (!templates.length) {
    return <div className="empty-state"><strong>No saved card templates yet.</strong><p>Choose a Jipra design or create a card in the designer, save it, then return here to preview it against a student.</p><a className="button button-primary" href="/cards/designer">Open card designer</a></div>;
  }
  if (!students.length) {
    return <div className="empty-state"><strong>No active students to preview.</strong><p>Import student records first, then choose a saved template and student here.</p></div>;
  }
  if (!template || !student) {
    return <div className="empty-state"><strong>Choose a saved template and student.</strong></div>;
  }

  return (
    <>
      <section className="panel card-preview-controls">
        <div className="card-preview-selectors">
          <label>Saved template
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · v{item.version} · {item.template.cardType}
                </option>
              ))}
            </select>
          </label>
          <label>Student
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              {students.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.student_account_no} · {item.full_name}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-primary" type="button" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
        <p className="card-preview-qr-note">
          Preview uses a nonfunctional QR placeholder, not a student token. Production cards contain the live opaque verification URL.
        </p>
        {qrError && <p className="settings-message" role="status">The preview QR could not be generated.</p>}
      </section>
      <section className="card-preview-result">
        <div className="card-preview-heading">
          <div><p className="eyebrow">{template.name} · version {template.version}</p><h2>{student.full_name}</h2></div>
          <span>{template.template.widthMm} × {template.template.heightMm} mm</span>
        </div>
        <div className="card-preview-stage">
          <CardRenderer
            cardRef={cardRef}
            className="card-preview-card"
            student={student}
            school={school}
            template={template.template}
            previewQr={previewQr}
          />
        </div>
        <section className={`card-preview-warnings${warnings.length ? " has-warnings" : ""}`} aria-live="polite">
          <strong>{warnings.length ? `${warnings.length} layout warning${warnings.length === 1 ? "" : "s"}` : "No clipping or component overlap detected."}</strong>
          {warnings.length > 0 && <ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>}
        </section>
      </section>
    </>
  );
}
