"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function Scanner() {
  const [code, setCode] = useState("");
  const [student, setStudent] = useState(null);
  const [error, setError] = useState("");
  const [cameraState, setCameraState] = useState("idle");
  const scannerRef = useRef(null);

  async function lookup(value) {
    let cleaned = value.trim();
    try { if (/^https?:\/\//i.test(cleaned)) cleaned = decodeURIComponent(new URL(cleaned).pathname.split("/").filter(Boolean).pop() || ""); } catch { setError("Invalid Sirius code."); return; }
    cleaned = cleaned.toUpperCase();
    if (!cleaned) return;
    setError(""); setStudent(null); setCode(cleaned);
    const response = await fetch(`/api/students/${encodeURIComponent(cleaned)}`);
    const result = await response.json();
    if (!response.ok) setError(result.error || "Invalid Sirius code."); else setStudent(result.student);
  }

  async function startCamera() {
    setCameraState("starting"); setError("");
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("sirius-reader"); scannerRef.current = scanner;
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 230, height: 230 }, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.UPC_A] }, (value) => { lookup(value); scanner.stop().catch(() => {}); setCameraState("idle"); }, () => {});
      setCameraState("active");
    } catch (cameraError) { console.error("Camera scanner failed", cameraError); setCameraState("idle"); setError("Camera unavailable. Use a USB scanner or enter the Sirius code."); }
  }

  useEffect(() => () => { scannerRef.current?.stop().catch(() => {}); }, []);

  return <div className="scanner-layout"><div className="scanner-panel"><div className="scanner-window"><div id="sirius-reader" /><div className="scanner-corners" /></div><button className="button button-primary scanner-button" type="button" onClick={startCamera} disabled={cameraState === "starting" || cameraState === "active"}>{cameraState === "active" ? "Camera scanning" : cameraState === "starting" ? "Starting camera..." : "Use camera"}</button><p className="scanner-hint">You can also scan with a USB scanner below.</p><form className="scanner-input" onSubmit={(event) => { event.preventDefault(); lookup(code); }}><input autoFocus value={code} onChange={(event) => setCode(event.target.value)} placeholder="SIRIUS-JIPRA-2026-..." aria-label="Sirius code" /><button type="submit">Find</button></form></div>{error && <div className="scan-message error-message"><strong>{error}</strong><button type="button" onClick={() => { setError(""); setStudent(null); setCode(""); }}>Try again</button></div>}{student && <section className="scan-result"><div className="profile-photo">{student.photo_url ? <img src={student.photo_url} alt={`Portrait of ${student.full_name}`} /> : student.full_name.slice(0, 1)}</div><div><p className="eyebrow">Student found</p><h2>{student.full_name}</h2><p className="profile-id">{student.student_uid}</p><div className="scan-details"><span><small>Admission</small><strong>{student.admission_number}</strong></span><span><small>Class</small><strong>{student.class_name || "Not provided"}</strong></span><span><small>School</small><strong>{student.registered_school_name || student.school_name || "Not provided"}</strong></span></div><Link className="text-link" href={`/students/${encodeURIComponent(student.student_uid)}`}>Open full profile →</Link></div></section>}</div>;
}