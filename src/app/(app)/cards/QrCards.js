"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cardFields, defaultCardTemplate } from "@/lib/cardTemplateSchema";

function newestTemplate(templates) {
  return [...templates].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null;
}

export default function QrCards({ students, school, templates: savedTemplates, canManage }) {
  const [codes, setCodes] = useState({});
  const [templates, setTemplates] = useState(savedTemplates);
  const initialTemplate = newestTemplate(savedTemplates);
  const [templateName, setTemplateName] = useState(initialTemplate?.name || "Standard identity card");
  const [selectedVersionId, setSelectedVersionId] = useState(initialTemplate?.id || "");
  const [template, setTemplate] = useState(initialTemplate?.template || defaultCardTemplate);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all(students.map(async (student) => {
      const dataUrl = await QRCode.toDataURL(student.verifyUrl, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: school?.logo_url ? "H" : "M",
      });
      if (!school?.logo_url) return [student.student_uid, dataUrl];
      const canvas = document.createElement("canvas");
      canvas.width = 220;
      canvas.height = 220;
      const context = canvas.getContext("2d");
      const qr = new Image();
      const logo = new Image();
      await Promise.all([
        new Promise((resolve, reject) => {
          qr.onload = resolve;
          qr.onerror = reject;
          qr.src = dataUrl;
        }),
        new Promise((resolve, reject) => {
          logo.onload = resolve;
          logo.onerror = reject;
          logo.crossOrigin = "anonymous";
          logo.src = school.logo_url;
        }),
      ]);
      context.drawImage(qr, 0, 0, 220, 220);
      context.fillStyle = "#fff";
      context.fillRect(82, 82, 56, 56);
      context.drawImage(logo, 88, 88, 44, 44);
      return [student.student_uid, canvas.toDataURL("image/png")];
    }))
      .then((entries) => { if (!cancelled) setCodes(Object.fromEntries(entries)); })
      .catch((error) => {
        console.error("Card QR generation failed", error);
        if (!cancelled) setMessage("Unable to prepare one or more QR codes.");
      });
    return () => { cancelled = true; };
  }, [students, school]);

  function updateTemplate(updates) {
    setTemplate((current) => ({ ...current, ...updates }));
    setSelectedVersionId("");
  }

  function selectVersion(id) {
    const saved = templates.find((item) => item.id === id);
    if (!saved) return;
    setSelectedVersionId(saved.id);
    setTemplateName(saved.name);
    setTemplate(saved.template);
    setMessage(`Loaded ${saved.name}, version ${saved.version}.`);
  }

  function toggleField(key, checked) {
    if ((key === "full_name" || key === "qr_code") && !checked) return;
    const fields = checked
      ? [...template.fields, key]
      : template.fields.filter((field) => field !== key);
    updateTemplate({ fields });
  }

  function moveField(key, direction) {
    const index = template.fields.indexOf(key);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= template.fields.length) return;
    const fields = [...template.fields];
    [fields[index], fields[nextIndex]] = [fields[nextIndex], fields[index]];
    updateTemplate({ fields });
  }

  async function saveTemplate() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/cards/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName, template }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "Unable to save the card template.");
        return;
      }
      const saved = { ...result.template, createdAt: new Date().toISOString() };
      setTemplates((current) => [saved, ...current]);
      setSelectedVersionId(saved.id);
      setTemplateName(saved.name);
      setTemplate(saved.template);
      setMessage(`Saved ${saved.name}, version ${saved.version}.`);
    } catch (error) {
      console.error("Card template save failed", error);
      setMessage("Unable to save the card template. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function changeTemplateName(value) {
    setTemplateName(value);
    setSelectedVersionId("");
  }

  function download(student) {
    const link = document.createElement("a");
    link.download = `${student.student_uid}.png`;
    link.href = codes[student.student_uid];
    link.click();
  }

  function fieldLabel(key) {
    return cardFields.find((field) => field.key === key)?.label || key;
  }

  function renderField(student, field) {
    if (field === "school_name") return <p className="card-school-name" key={field}>{school?.school_name || "School"}</p>;
    if (field === "full_name") return <h2 className="card-student-name" key={field}>{student.full_name}</h2>;
    if (field === "student_account_no") return <p className="card-student-number" key={field}>{student.student_account_no}</p>;
    if (field === "class_name") return <p className="card-detail" key={field}>Class: {student.class_name || "Not set"}</p>;
    if (field === "stream") return <p className="card-detail" key={field}>Stream: {student.stream || "Not set"}</p>;
    if (field === "photo_url") {
      return student.photo_url
        ? <img className="card-photo" src={student.photo_url} alt={`Portrait of ${student.full_name}`} key={field} />
        : <span className="card-photo card-initial" key={field}>{student.full_name.slice(0, 1)}</span>;
    }
    if (field === "qr_code") {
      return codes[student.student_uid]
        ? <img className="qr-image" src={codes[student.student_uid]} alt={`Verification QR code for ${student.full_name}`} key={field} />
        : <div className="qr-loading" key={field}>Preparing QR</div>;
    }
    return null;
  }

  return (
    <>
      <section className="panel card-designer-controls">
        <div className="panel-heading"><div><p className="eyebrow">Card designer</p><h2>Customize the layout</h2></div></div>
        <div className="card-designer-form">
          {templates.length > 0 && (
            <label>Load a saved version
              <select value={selectedVersionId} onChange={(event) => selectVersion(event.target.value)} disabled={busy}>
                <option value="">Custom / unsaved</option>
                {templates.map((saved) => <option value={saved.id} key={saved.id}>{saved.name} · v{saved.version}</option>)}
              </select>
            </label>
          )}
          <label>Template name<input value={templateName} maxLength={100} onChange={(event) => changeTemplateName(event.target.value)} disabled={busy || !canManage} /></label>
          <label>Card title<input value={template.title} maxLength={100} onChange={(event) => updateTemplate({ title: event.target.value })} disabled={busy} /></label>
          <label>Width (mm)<input type="number" min="50" max="150" step="1" value={template.widthMm} onChange={(event) => updateTemplate({ widthMm: Number(event.target.value) })} disabled={busy} /></label>
          <label>Height (mm)<input type="number" min="30" max="100" step="1" value={template.heightMm} onChange={(event) => updateTemplate({ heightMm: Number(event.target.value) })} disabled={busy} /></label>
          <label>Accent color<input type="color" value={template.accentColor} onChange={(event) => updateTemplate({ accentColor: event.target.value })} disabled={busy} /></label>
          <label>Background color<input type="color" value={template.backgroundColor} onChange={(event) => updateTemplate({ backgroundColor: event.target.value })} disabled={busy} /></label>
        </div>
        <div className="card-field-options">
          <strong>Available fields</strong>
          {cardFields.map(({ key, label }) => (
            <label key={key}><input type="checkbox" checked={template.fields.includes(key)} disabled={busy || key === "full_name" || key === "qr_code"} onChange={(event) => toggleField(key, event.target.checked)} />{label}</label>
          ))}
          <p>Fee balance is intentionally unavailable on identity cards.</p>
        </div>
        <div className="card-template-actions">
          {canManage
            ? <button className="button button-primary" type="button" onClick={saveTemplate} disabled={busy || !templateName.trim()}>{busy ? "Saving..." : "Save new version"}</button>
            : <span>Only school admins can save templates.</span>}
          {message && <p className="settings-message" role="status">{message}</p>}
        </div>
        {template.fields.length > 0 && (
          <div className="card-field-order">
            <strong>Field order</strong>
            {template.fields.map((field, index) => (
              <span key={field}>{fieldLabel(field)}
                <button type="button" aria-label={`Move ${fieldLabel(field)} up`} onClick={() => moveField(field, -1)} disabled={busy || index === 0}>↑</button>
                <button type="button" aria-label={`Move ${fieldLabel(field)} down`} onClick={() => moveField(field, 1)} disabled={busy || index === template.fields.length - 1}>↓</button>
              </span>
            ))}
          </div>
        )}
      </section>
      <div className="card-actions"><span>{students.length} cards ready</span><button className="button button-primary" type="button" onClick={() => window.print()}>Print / Save PDF <span>↗</span></button></div>
      <div className="qr-grid">
        {students.map((student) => (
          <article
            className="qr-card"
            key={student.student_uid}
            style={{
              "--card-accent": template.accentColor,
              "--card-background": template.backgroundColor,
              "--card-width": `${template.widthMm}mm`,
              "--card-height": `${template.heightMm}mm`,
            }}
          >
            <p className="card-template-title">{template.title}</p>
            <div className={`qr-card-content${template.fields.includes("photo_url") ? " card-with-photo" : ""}`}>{template.fields.map((field) => renderField(student, field))}</div>
            <div className="qr-card-footer"><button type="button" onClick={() => download(student)} disabled={!codes[student.student_uid]}>Download QR</button></div>
          </article>
        ))}
      </div>
    </>
  );
}
