import test from "node:test";
import assert from "node:assert/strict";

import { defaultCardTemplate, validateCardTemplate } from "./cardTemplateSchema.js";

test("card template accepts only safe, available fields and bounded layout values", () => {
  const template = validateCardTemplate(defaultCardTemplate);
  assert.deepEqual(template, defaultCardTemplate);
  assert.ok(!template.fields.includes("fee_balance"));
});

test("card template rejects fee balance and arbitrary template properties", () => {
  assert.throws(
    () => validateCardTemplate({ ...defaultCardTemplate, fields: [...defaultCardTemplate.fields, "fee_balance"] }),
    /unsupported field/,
  );
  assert.throws(
    () => validateCardTemplate({ ...defaultCardTemplate, html: "<script>" }),
    /unsupported setting/,
  );
});

test("card template requires the name and verification QR and validates design values", () => {
  assert.throws(
    () => validateCardTemplate({ ...defaultCardTemplate, fields: ["qr_code"] }),
    /Student name and verification QR/,
  );
  assert.throws(
    () => validateCardTemplate({ ...defaultCardTemplate, widthMm: 500 }),
    /Card size/,
  );
  assert.throws(
    () => validateCardTemplate({ ...defaultCardTemplate, accentColor: "red" }),
    /hexadecimal/,
  );
});
