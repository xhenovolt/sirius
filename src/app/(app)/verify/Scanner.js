"use client";

import { useEffect, useRef, useState } from "react";

export default function Scanner() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [cameraState, setCameraState] = useState("idle");
  const scannerRef = useRef(null);

  async function lookup(value) {
    let token = value.trim();
    if (/^https?:\/\//i.test(token)) {
      try {
        const scannedUrl = new URL(token);
        const match = /^\/v\/([A-Za-z0-9_-]{22,86})\/?$/.exec(scannedUrl.pathname);
        if (!match) throw new Error("Unrecognized verification URL.");
        token = match[1];
      } catch {
        setError("Invalid Sirius verification code.");
        return;
      }
    }
    if (!/^[A-Za-z0-9_-]{22,86}$/.test(token)) {
      setError("Invalid Sirius verification code.");
      return;
    }
    window.location.assign(`/v/${encodeURIComponent(token)}`);
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

  return <div className="scanner-layout"><div className="scanner-panel"><div className="scanner-window"><div id="sirius-reader" /><div className="scanner-corners" /></div><button className="button button-primary scanner-button" type="button" onClick={startCamera} disabled={cameraState === "starting" || cameraState === "active"}>{cameraState === "active" ? "Camera scanning" : cameraState === "starting" ? "Starting camera..." : "Use camera"}</button><p className="scanner-hint">Scan a Sirius QR code or enter its opaque token below. Verification opens the live record.</p><form className="scanner-input" onSubmit={(event) => { event.preventDefault(); lookup(code); }}><input autoFocus value={code} onChange={(event) => setCode(event.target.value)} placeholder="Paste token or verification URL" aria-label="Sirius verification token" /><button type="submit">Verify</button></form></div>{error && <div className="scan-message error-message"><strong>{error}</strong><button type="button" onClick={() => { setError(""); setCode(""); }}>Try again</button></div>}</div>;
}