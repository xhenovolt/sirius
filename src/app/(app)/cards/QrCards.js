"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  cardElementDefaults,
  cardFields,
  clearanceCardPresets,
  defaultCardTemplate,
} from "@/lib/cardTemplateSchema";

const TITLE_SOURCE_OPTIONS = [
  ["custom", "Custom title"],
  ["school_name", "School name"],
  ["full_name", "Student name"],
  ["student_account_no", "Student account number"],
  ["class_name", "Class"],
  ["stream", "Stream"],
  ["student_type", "Student type"],
];

function newestTemplate(templates) {
  return [...templates].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))[0] || null;
}

function fieldLabel(key) {
  if (key === "title") return "Title";
  return cardFields.find((field) => field.key === key)?.label || key;
}

function getFieldValue(field, student, school) {
  if (field === "school_name") return school?.school_name || "School name";
  if (field === "school_term") return school?.current_term ? `TERM | ${school.current_term}` : "Current term";
  if (field === "school_phone") return school?.contact_phone ? `Tel: ${school.contact_phone}` : "School phone";
  if (field === "full_name") return student.full_name || "Student name";
  if (field === "student_account_no") return student.student_account_no || "Student number";
  if (field === "class_name") return `Class: ${student.class_name || "Not set"}`;
  if (field === "stream") return `Stream: ${student.stream || "Not set"}`;
  if (field === "student_type") return `Type: ${student.student_type || "Not set"}`;
  return "";
}

function constrainElement(element) {
  const width = Math.max(3, Math.min(100, Number(element.width) || 3));
  const height = Math.max(3, Math.min(100, Number(element.height) || 3));
  const x = Math.max(0, Math.min(100 - width, Number(element.x) || 0));
  const y = Math.max(0, Math.min(100 - height, Number(element.y) || 0));
  return {
    ...element,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    fontSize: Math.max(6, Math.min(48, Number(element.fontSize) || 6)),
  };
}

export default function QrCards({ students, school, templates: savedTemplates, canManage, selectedTemplateId }) {
  const [codes, setCodes] = useState({});
  const [templates, setTemplates] = useState(savedTemplates);
  const initialTemplate = savedTemplates.find((item) => item.id === selectedTemplateId)
    || newestTemplate(savedTemplates.filter((item) => item.template.cardType === "general"));
  const [templateName, setTemplateName] = useState(initialTemplate?.name || "Standard identity card");
  const [selectedVersionId, setSelectedVersionId] = useState(initialTemplate?.id || "");
  const [template, setTemplate] = useState(initialTemplate?.template || defaultCardTemplate);
  const [selectedField, setSelectedField] = useState("title");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pointerActionRef = useRef(null);

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

  function updateElement(field, updates) {
    updateTemplate({
      elements: template.elements.map((element) => (
        element.field === field ? constrainElement({ ...element, ...updates }) : element
      )),
    });
  }

  function selectVersion(id) {
    const saved = templates.find((item) => item.id === id);
    if (!saved) return;
    setSelectedVersionId(saved.id);
    setTemplateName(saved.name);
    setTemplate(saved.template);
    setSelectedField("title");
    setMessage(`Loaded ${saved.name}, version ${saved.version}.`);
  }

  function selectPreset(name) {
    const preset = clearanceCardPresets.find((item) => item.name === name);
    if (!preset) return;
    setTemplateName(preset.name);
    setSelectedVersionId("");
    setTemplate(preset.template);
    setSelectedField("title");
    setMessage(`${preset.name} loaded. Save it as a school template to reuse it.`);
  }

  function toggleField(key, checked) {
    if ((key === "full_name" || key === "qr_code") && !checked) return;
    if (checked) {
      updateTemplate({
        fields: [...template.fields, key],
        elements: [...template.elements, { field: key, ...cardElementDefaults[key] }],
      });
      setSelectedField(key);
    } else {
      updateTemplate({
        fields: template.fields.filter((field) => field !== key),
        elements: template.elements.filter((element) => element.field !== key),
      });
      if (selectedField === key) setSelectedField("title");
    }
  }

  function startPointerAction(field, event, mode) {
    if (busy) return;
    event.preventDefault();
    event.stopPropagation();
    const element = template.elements.find((item) => item.field === field);
    const bounds = event.currentTarget.closest(".qr-card-editor")?.getBoundingClientRect();
    if (!element || !bounds?.width || !bounds?.height) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerActionRef.current = {
      pointerId: event.pointerId,
      field,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      stageWidth: bounds.width,
      stageHeight: bounds.height,
      element,
    };
    setSelectedField(field);
  }

  function movePointerAction(event) {
    const action = pointerActionRef.current;
    if (!action || action.pointerId !== event.pointerId) return;
    const dx = ((event.clientX - action.startClientX) / action.stageWidth) * 100;
    const dy = ((event.clientY - action.startClientY) / action.stageHeight) * 100;
    const { element } = action;
    if (action.mode === "move") {
      updateElement(action.field, { x: element.x + dx, y: element.y + dy });
    } else {
      updateElement(action.field, { width: element.width + dx, height: element.height + dy });
    }
  }

  function finishPointerAction(event) {
    if (pointerActionRef.current?.pointerId === event.pointerId) pointerActionRef.current = null;
  }

  function handleElementKeyDown(field, event) {
    const step = event.shiftKey ? 5 : 1;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    setSelectedField(field);
    const element = template.elements.find((item) => item.field === field);
    if (!element) return;
    const changes = {
      ArrowUp: { y: element.y - step },
      ArrowDown: { y: element.y + step },
      ArrowLeft: { x: element.x - step },
      ArrowRight: { x: element.x + step },
    }[event.key];
    updateElement(field, changes);
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
    if (!codes[student.student_uid]) return;
    const link = document.createElement("a");
    link.download = `${student.student_uid}.png`;
    link.href = codes[student.student_uid];
    link.click();
  }

  function renderElementValue(student, field) {
    if (field === "title") {
      return template.titleField === "custom"
        ? template.title
        : getFieldValue(template.titleField, student, school);
    }
    if (field === "school_name" || field === "full_name" || field === "student_account_no"
      || field === "school_term" || field === "school_phone" || field === "class_name"
      || field === "stream" || field === "student_type") {
      return getFieldValue(field, student, school);
    }
    if (field === "school_logo") {
      return school?.logo_url
        ? <img className="card-element-school-logo" src={school.logo_url} alt={`${school.school_name || "School"} logo`} />
        : <span className="card-element-logo-placeholder">LOGO</span>;
    }
    if (field === "photo_url") {
      return student.photo_url
        ? <img className="card-element-photo" src={student.photo_url} alt={`Portrait of ${student.full_name || "student"}`} />
        : <span className="card-element-initial">{(student.full_name || "?").slice(0, 1)}</span>;
    }
    if (field === "qr_code") {
      return codes[student.student_uid]
        ? <img className="card-element-qr" src={codes[student.student_uid]} alt={`Verification QR code for ${student.full_name || "student"}`} />
        : <span className="qr-loading">QR code</span>;
    }
    if (field === "clearance_deadline") {
      return student.clearance_deadline
        ? `Deadline: ${student.clearance_deadline}`
        : "Deadline: __________________";
    }
    if (field === "issued_on") return `Issued: ${student.issued_on || "________________"}`;
    if (field === "signature_line") return "Sign: ................................";
    if (field === "accounts_department") return "(Accounts Dept.)";
    if (field === "clearance_stamp") {
      return student.clearance_verdict === "CLEARED" || (designer && template.cardType === "permanent")
        ? "CLEARED"
        : "ALLOWED";
    }
    return null;
  }

  function renderCard(student, designer = false) {
    return (
      <article
        className={`qr-card ${designer ? "qr-card-editor" : "qr-card-issued"}`}
        key={student.student_uid}
        style={{
          "--card-accent": template.accentColor,
          "--card-background": template.backgroundColor,
          "--card-width": `${template.widthMm}mm`,
          "--card-height": `${template.heightMm}mm`,
          "--card-ratio": `${template.widthMm} / ${template.heightMm}`,
        }}
      >
        {template.elements.map((element) => {
          const color = element.color === "accent"
            ? template.accentColor
            : element.color === "text"
              ? "#172522"
              : element.color === "muted"
                ? "#63736c"
                : element.color;
          return (
            <div
              key={element.field}
              className={`card-element card-element-${element.field}${designer && selectedField === element.field ? " card-element-selected" : ""}${designer ? " card-element-draggable" : ""}`}
              style={{
                left: `${element.x}%`,
                top: `${element.y}%`,
                width: `${element.width}%`,
                height: `${element.height}%`,
                fontSize: `${element.fontSize}px`,
                textAlign: element.align,
                color,
              }}
              aria-label={designer ? `${fieldLabel(element.field)}. Drag to move; use arrow keys for precise placement.` : undefined}
              role={designer ? "group" : undefined}
              tabIndex={designer ? 0 : undefined}
              onClick={designer ? () => setSelectedField(element.field) : undefined}
              onPointerDown={designer ? (event) => {
                if (!event.target.closest(".designer-resize-handle")) startPointerAction(element.field, event, "move");
              } : undefined}
              onPointerMove={designer ? movePointerAction : undefined}
              onPointerUp={designer ? finishPointerAction : undefined}
              onPointerCancel={designer ? finishPointerAction : undefined}
              onKeyDown={designer ? (event) => handleElementKeyDown(element.field, event) : undefined}
            >
              {renderElementValue(student, element.field)}
              {designer && selectedField === element.field && (
                <button
                  type="button"
                  className="designer-resize-handle"
                  aria-label={`Resize ${fieldLabel(element.field)}`}
                  onPointerDown={(event) => startPointerAction(element.field, event, "resize")}
                  onClick={(event) => event.stopPropagation()}
                />
              )}
            </div>
          );
        })}
      </article>
    );
  }

  const selectedElement = template.elements.find((element) => element.field === selectedField) || template.elements[0];
  const previewStudent = students[0] || {
    student_uid: "designer-preview",
    full_name: "Alexandra Sample",
    student_account_no: "STU-001",
    class_name: "Primary 4",
    stream: "Blue",
    clearance_verdict: template.cardType === "permanent" ? "CLEARED" : "ALLOWED",
  };
  const reportStudents = template.cardType === "general"
    ? students
    : students.filter((student) => student.clearance_report_type === template.cardType);
  const inputClass = "card-designer-property-input";

  return (
    <>
      <section className="panel card-designer-controls">
        <div className="panel-heading">
          <div><p className="eyebrow">Card designer</p><h2>Design the whole card</h2></div>
          <p className="card-designer-hint">Drag components on the card. Select a component to set its exact position, size, and text style.</p>
        </div>
        <div className="card-designer-form">
          {templates.length > 0 && (
            <label>Load a saved version
              <select value={selectedVersionId} onChange={(event) => selectVersion(event.target.value)} disabled={busy}>
                <option value="">Custom / unsaved</option>
                {templates.map((saved) => <option value={saved.id} key={saved.id}>{saved.name} · v{saved.version}</option>)}
              </select>
            </label>
          )}
          <label>Start from a clearance design
            <select value="" onChange={(event) => selectPreset(event.target.value)} disabled={busy}>
              <option value="">Choose a starting template</option>
              {clearanceCardPresets.map((preset) => <option value={preset.name} key={preset.name}>{preset.name}</option>)}
            </select>
          </label>
          <label>Template name<input value={templateName} maxLength={100} onChange={(event) => changeTemplateName(event.target.value)} disabled={busy || !canManage} /></label>
          <label>Template type
            <select value={template.cardType} onChange={(event) => updateTemplate({ cardType: event.target.value })} disabled={busy}>
              <option value="general">General student card</option>
              <option value="temporary">Temporary clearance</option>
              <option value="permanent">Permanent clearance</option>
            </select>
          </label>
          <label>Card width (mm)<input type="number" min="50" max="150" step="1" value={template.widthMm} onChange={(event) => updateTemplate({ widthMm: Number(event.target.value) })} disabled={busy} /></label>
          <label>Card height (mm)<input type="number" min="30" max="100" step="1" value={template.heightMm} onChange={(event) => updateTemplate({ heightMm: Number(event.target.value) })} disabled={busy} /></label>
          <label>Accent color<input type="color" value={template.accentColor} onChange={(event) => updateTemplate({ accentColor: event.target.value })} disabled={busy} /></label>
          <label>Card background<input type="color" value={template.backgroundColor} onChange={(event) => updateTemplate({ backgroundColor: event.target.value })} disabled={busy} /></label>
        </div>
        <div className="card-field-options">
          <strong>Card components</strong>
          <label><input type="checkbox" checked disabled />Title</label>
          {cardFields.map(({ key, label }) => (
            <label key={key}><input type="checkbox" checked={template.fields.includes(key)} disabled={busy || key === "full_name" || key === "qr_code"} onChange={(event) => toggleField(key, event.target.checked)} />{label}</label>
          ))}
          <p>Student name and verification QR stay on every card. Fee balance is intentionally unavailable.</p>
        </div>
        <div className="card-designer-workspace">
          <div className="card-designer-canvas-panel">
            <div className="card-designer-canvas-heading">
              <div><strong>Live card canvas</strong><span>Drag to move · drag the corner to resize · arrow keys for fine placement</span></div>
              <span>{template.widthMm} × {template.heightMm} mm</span>
            </div>
            <div className="card-designer-stage">
              {renderCard(previewStudent, true)}
            </div>
          </div>
          <aside className="card-designer-properties" aria-label="Selected component settings">
            <div className="card-designer-properties-title"><strong>Component properties</strong><span>{fieldLabel(selectedElement.field)}</span></div>
            <div className="card-designer-layer-list" aria-label="Card component layers">
              {template.elements.map((element) => (
                <button
                  type="button"
                  key={element.field}
                  className={selectedField === element.field ? "selected" : ""}
                  onClick={() => setSelectedField(element.field)}
                >{fieldLabel(element.field)}</button>
              ))}
            </div>
            {selectedElement.field === "title" && (
              <>
                <label>Title shows
                  <select value={template.titleField} onChange={(event) => updateTemplate({ titleField: event.target.value })} disabled={busy}>
                    {TITLE_SOURCE_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                {template.titleField === "custom" && (
                  <label>Title text
                    <input value={template.title} maxLength={100} onChange={(event) => updateTemplate({ title: event.target.value })} disabled={busy} />
                  </label>
                )}
              </>
            )}
            <div className="card-designer-property-grid">
              <label>Left (%)
                <input className={inputClass} type="number" min="0" max={100 - selectedElement.width} step="0.5" value={selectedElement.x} onChange={(event) => updateElement(selectedElement.field, { x: Number(event.target.value) })} disabled={busy} />
              </label>
              <label>Top (%)
                <input className={inputClass} type="number" min="0" max={100 - selectedElement.height} step="0.5" value={selectedElement.y} onChange={(event) => updateElement(selectedElement.field, { y: Number(event.target.value) })} disabled={busy} />
              </label>
              <label>Width (%)
                <input className={inputClass} type="number" min="3" max={100 - selectedElement.x} step="0.5" value={selectedElement.width} onChange={(event) => updateElement(selectedElement.field, { width: Number(event.target.value) })} disabled={busy} />
              </label>
              <label>Height (%)
                <input className={inputClass} type="number" min="3" max={100 - selectedElement.y} step="0.5" value={selectedElement.height} onChange={(event) => updateElement(selectedElement.field, { height: Number(event.target.value) })} disabled={busy} />
              </label>
              <label>Text size (px)
                <input className={inputClass} type="number" min="6" max="48" step="1" value={selectedElement.fontSize} onChange={(event) => updateElement(selectedElement.field, { fontSize: Number(event.target.value) })} disabled={busy || selectedElement.field === "photo_url" || selectedElement.field === "qr_code"} />
              </label>
              <label>Alignment
                <select value={selectedElement.align} onChange={(event) => updateElement(selectedElement.field, { align: event.target.value })} disabled={busy || selectedElement.field === "photo_url" || selectedElement.field === "qr_code"}>
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
              </label>
            </div>
            <label>Text color
              <select value={["accent", "text", "muted"].includes(selectedElement.color) ? selectedElement.color : "custom"} onChange={(event) => {
                if (event.target.value !== "custom") updateElement(selectedElement.field, { color: event.target.value });
              }} disabled={busy || selectedElement.field === "photo_url" || selectedElement.field === "qr_code"}>
                <option value="accent">Card accent</option><option value="text">Dark text</option><option value="muted">Muted text</option>
                {!["accent", "text", "muted"].includes(selectedElement.color) && <option value="custom">Custom color</option>}
              </select>
            </label>
            <label>Custom text color
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(selectedElement.color) ? selectedElement.color : template.accentColor} onChange={(event) => updateElement(selectedElement.field, { color: event.target.value })} disabled={busy || selectedElement.field === "photo_url" || selectedElement.field === "qr_code"} />
            </label>
          </aside>
        </div>
        <div className="card-template-actions">
          {canManage
            ? <button className="button button-primary" type="button" onClick={saveTemplate} disabled={busy || !templateName.trim()}>{busy ? "Saving..." : "Save template / version"}</button>
            : <span>Only school admins can save templates.</span>}
          {message && <p className="settings-message" role="status">{message}</p>}
        </div>
      </section>
      {students.length > 0 && (
        reportStudents.length === 0
          ? <div className="empty-state"><strong>No students match this clearance report.</strong><p>Temporary reports include students currently allowed by an allowance or threshold. Permanent reports include students marked CLEARED.</p></div>
          : <>
            <div className="card-actions"><span>{reportStudents.length} {template.cardType === "general" ? "cards" : `${template.cardType} clearance cards`} ready</span><button className="button button-primary" type="button" onClick={() => window.print()}>Print / Save PDF <span>↗</span></button></div>
            <div
              className="qr-grid"
              style={{ "--card-width": `${template.widthMm}mm`, "--card-height": `${template.heightMm}mm` }}
            >{reportStudents.map((student) => renderCard(student))}</div>
          </>
      )}
    </>
  );
}
