"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrCards({ students, school }) {
  const [codes, setCodes] = useState({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(students.map(async (student) => {
      const dataUrl = await QRCode.toDataURL(student.verifyUrl, { width: 220, margin: 1, errorCorrectionLevel: school?.logo_url ? "H" : "M" });
      if (!school?.logo_url) return [student.student_uid, dataUrl];
      const canvas = document.createElement("canvas"); canvas.width = 220; canvas.height = 220;
      const context = canvas.getContext("2d"); const qr = new Image(); const logo = new Image();
      await Promise.all([new Promise((resolve, reject) => { qr.onload = resolve; qr.onerror = reject; qr.src = dataUrl; }), new Promise((resolve, reject) => { logo.onload = resolve; logo.onerror = reject; logo.crossOrigin = "anonymous"; logo.src = school.logo_url; })]);
      context.drawImage(qr, 0, 0, 220, 220); context.fillStyle = "#fff"; context.fillRect(82, 82, 56, 56); context.drawImage(logo, 88, 88, 44, 44);
      return [student.student_uid, canvas.toDataURL("image/png")];
    }))
      .then((entries) => { if (!cancelled) setCodes(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [students, school]);

  function download(student) {
    const link = document.createElement("a");
    link.download = `${student.student_uid}.png`;
    link.href = codes[student.student_uid];
    link.click();
  }

  return <><div className="card-actions"><span>{students.length} students ready</span><button className="button button-primary" type="button" onClick={() => window.print()}>Print cards <span>↗</span></button></div><div className="qr-grid">{students.map((student) => <article className="qr-card" key={student.student_uid}><div className="qr-card-top">{student.photo_url ? <img className="card-photo" src={student.photo_url} alt="" /> : <span className="card-photo card-initial">{student.full_name.slice(0, 1)}</span>}<div><p className="eyebrow">{school?.school_name || "Sirius identity card"}</p><h2>{student.full_name}</h2><p>{student.student_account_no} · {student.class_name || "Class not set"}</p></div><span className="brand-mark">S</span></div>{codes[student.student_uid] ? <img className="qr-image" src={codes[student.student_uid]} alt={`QR code for ${student.full_name}`} /> : <div className="qr-loading">Preparing QR</div>}<div className="qr-card-footer"><span>{student.student_uid}</span><button type="button" onClick={() => download(student)} disabled={!codes[student.student_uid]}>Download</button></div></article>)}</div></>;
}