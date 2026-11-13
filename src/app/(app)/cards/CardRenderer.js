"use client";

import { cardFields } from "@/lib/cardTemplateSchema";

function fieldLabel(key) {
  if (key === "title") return "Title";
  return cardFields.find((field) => field.key === key)?.label || key;
}

function formatCardDate(value) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatStampDate(value) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return String(value);
  const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
  return `${match[3]} ${month.toUpperCase()} ${match[1]}`;
}

function formatFeeBalance(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-UG", { maximumFractionDigits: 2 })
    : String(value);
}

function getFieldValue(field, student, school) {
  if (field === "school_name") return school?.school_name || "School name";
  if (field === "school_term") {
    if (!school?.current_term) return "Current term";
    return school.current_term;
  }
  if (field === "school_phone") return school?.contact_phone || "School phone";
  if (field === "full_name") return student.full_name || "Student name";
  if (field === "student_account_no") return student.student_account_no || "Student number";
  if (field === "class_name") return student.class_name || "Not set";
  if (field === "stream") return student.stream || "Not set";
  if (field === "student_type") return student.student_type || "Not set";
  if (field === "fee_balance") return formatFeeBalance(student.fee_balance);
  return "";
}

export default function CardRenderer({
  student,
  school,
  template,
  codes = {},
  previewQr = "",
  designer = false,
  selectedField,
  onSelectField,
  onPointerAction,
  onPointerMove,
  onPointerEnd,
  onElementKeyDown,
  cardRef,
  className = "",
}) {
  function getLabel(field, element) {
    if (field === "school_term" && element.label.text === "TERM | "
      && (!school?.current_term || /^(?:(?:\d+)(?:st|nd|rd|th)?\s+)?term\b/i.test(school.current_term))) {
      return "";
    }
    return element.label.text;
  }

  function getElementText(field, element) {
    if (element.value.custom) return element.value.text;
    if (field === "title") {
      return template.titleField === "custom"
        ? template.title
        : getFieldValue(template.titleField, student, school);
    }
    if (["school_name", "full_name", "student_account_no", "school_term", "school_phone",
      "class_name", "stream", "student_type", "fee_balance"].includes(field)) {
      return getFieldValue(field, student, school);
    }
    if (field === "clearance_deadline") {
      return student.clearance_deadline ? formatCardDate(student.clearance_deadline) : "________________";
    }
    if (field === "issued_on") return formatCardDate(student.issued_on) || "________________";
    if (field === "signature_line") return "................................";
    if (field === "accounts_department") return "(Accounts Dept.)";
    return "";
  }

  function getPartStyle(part, baseColor) {
    if (!part) return undefined;
    const color = part.color === "accent"
      ? template.accentColor
      : part.color === "text"
        ? "#172522"
        : part.color === "muted"
          ? "#63736c"
          : part.color || baseColor;
    const decoration = [
      part.underline ? "underline" : "",
      part.strikethrough ? "line-through" : "",
    ].filter(Boolean).join(" ");
    return {
      ...(part.fontSize === undefined ? {} : { fontSize: `${part.fontSize}px` }),
      ...(color ? { color } : {}),
      ...(part.bold === undefined ? {} : { fontWeight: part.bold ? 700 : 400 }),
      ...(part.italic === undefined ? {} : { fontStyle: part.italic ? "italic" : "normal" }),
      ...(part.underline !== undefined || part.strikethrough !== undefined
        ? { textDecorationLine: decoration || "none" }
        : {}),
    };
  }

  function renderElementValue(field, element, baseColor) {
    if (["title", "school_name", "full_name", "student_account_no", "school_term", "school_phone",
      "class_name", "stream", "student_type", "fee_balance", "clearance_deadline", "issued_on",
      "signature_line", "accounts_department"].includes(field)) {
      const label = getLabel(field, element);
      return (
        <>
          {element.label.visible && label && (
            <span className="card-text-part card-text-label" style={getPartStyle(element.label.style, baseColor)}>{label}</span>
          )}
          {element.value.visible && (
            <span className="card-text-part card-text-value" style={getPartStyle(element.value.style, baseColor)}>
              {getElementText(field, element)}
            </span>
          )}
        </>
      );
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
      const code = codes[student.student_uid] || previewQr;
      return code
        ? <img className="card-element-qr" src={code} alt={`Verification QR code for ${student.full_name || "student"}`} />
        : <span className="qr-loading">QR code</span>;
    }
    if (field === "clearance_stamp") {
      const stampDate = student.clearance_stamp_date || student.issued_on;
      const stampLogo = school?.logo_url
        ? <span className="card-stamp-logo" style={{ maskImage: `url("${school.logo_url}")`, WebkitMaskImage: `url("${school.logo_url}")` }} aria-label="School logo in stamp color" />
        : <span className="card-stamp-logo-fallback">{school?.school_name?.split(/\s+/).slice(0, 3).map((part) => part[0]).join("") || "JPS"}</span>;
      return (
        <span className="clearance-stamp-content">
          <span className="clearance-stamp-department">{template.stampDepartment || "ACCOUNTS DEPT."}</span>
          {stampLogo}
          <time>{formatStampDate(stampDate) || "DATE"}</time>
          <strong>{student.clearance_verdict === "NOT CLEARED" ? "NOT CLEARED" : "CLEARED"}</strong>
        </span>
      );
    }
    return null;
  }

  return (
    <article
      ref={cardRef}
      className={`qr-card ${designer ? "qr-card-editor" : "qr-card-issued"} ${className}`.trim()}
      style={{
        "--card-accent": template.accentColor,
        "--card-background": template.backgroundColor,
        "--card-width": `${template.widthMm}mm`,
        "--card-height": `${template.heightMm}mm`,
        "--card-ratio": `${template.widthMm} / ${template.heightMm}`,
      }}
    >
      {template.elements.filter((element) => element.visible).map((element) => {
        const color = element.color === "accent"
          ? template.accentColor
          : element.color === "text"
            ? "#172522"
            : element.color === "muted"
              ? "#63736c"
              : element.color;
        const textDecorationLine = [
          element.underline ? "underline" : "",
          element.strikethrough ? "line-through" : "",
        ].filter(Boolean).join(" ") || "none";
        return (
          <div
            key={element.field}
            data-card-element-field={element.field}
            className={`card-element card-element-${element.field}${designer && selectedField === element.field ? " card-element-selected" : ""}${designer ? " card-element-draggable" : ""}`}
            style={{
              left: `${element.x}%`,
              top: `${element.y}%`,
              width: `${element.width}%`,
              height: `${element.height}%`,
              fontSize: `${element.fontSize}px`,
              transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
              textAlign: element.align,
              color,
              fontWeight: element.bold ? 700 : 400,
              fontStyle: element.italic ? "italic" : "normal",
              textDecorationLine,
            }}
            aria-label={designer ? `${fieldLabel(element.field)}. Drag to move; use arrow keys for precise placement.` : undefined}
            role={designer ? "group" : undefined}
            tabIndex={designer ? 0 : undefined}
            onClick={designer ? () => onSelectField(element.field) : undefined}
            onPointerDown={designer ? (event) => {
              if (!event.target.closest(".designer-resize-handle")) onPointerAction(element.field, event, "move");
            } : undefined}
            onPointerMove={designer ? onPointerMove : undefined}
            onPointerUp={designer ? onPointerEnd : undefined}
            onPointerCancel={designer ? onPointerEnd : undefined}
            onKeyDown={designer ? (event) => onElementKeyDown(element.field, event) : undefined}
          >
            {renderElementValue(element.field, element, color)}
            {designer && selectedField === element.field && (
              <button
                type="button"
                className="designer-resize-handle"
                aria-label={`Resize ${fieldLabel(element.field)}`}
                onPointerDown={(event) => onPointerAction(element.field, event, "resize")}
                onClick={(event) => event.stopPropagation()}
              />
            )}
          </div>
        );
      })}
    </article>
  );
}
