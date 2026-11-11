import test from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "./errors.js";

test("missing APP_BASE_URL is a configuration error", () => {
  const error = Object.assign(new Error("APP_BASE_URL is not configured."), { code: "APP_BASE_URL_INVALID" });
  assert.equal(classifyError(error).code, "CONFIG");
});

test("MySQL and network error codes are database errors", () => {
  for (const code of ["ER_ACCESS_DENIED_ERROR", "ECONNREFUSED", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST"]) {
    assert.equal(classifyError(Object.assign(new Error("connect failed"), { code })).code, "DATABASE");
  }
});

test("session errors ask the user to sign in again", () => {
  assert.equal(classifyError(new Error("Your session expired. Please sign in again.")).code, "SESSION");
});

test("capacity and plan errors are entitlement errors", () => {
  assert.equal(classifyError(new Error("Card capacity reached for this school.")).code, "ENTITLEMENT");
});

test("upload failures are storage errors", () => {
  assert.equal(classifyError(new Error("Upload to storage service failed.")).code, "STORAGE");
});

test("unknown errors fall back safely without leaking the message", () => {
  const result = classifyError(new Error("secret internal detail"));
  assert.equal(result.code, "UNEXPECTED");
  assert.ok(!result.hint.includes("secret"));
  assert.ok(result.title.length > 0);
});

test("classifyError tolerates non-error values", () => {
  assert.equal(classifyError(null).code, "UNEXPECTED");
  assert.equal(classifyError("boom").code, "UNEXPECTED");
});