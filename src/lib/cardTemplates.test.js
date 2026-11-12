import test from "node:test";
import assert from "node:assert/strict";

import { clearanceCardPresets, defaultCardTemplate, validateCardTemplate } from "./cardTemplateSchema.js";

test("card template accepts only safe, available fields and bounded layout values", () => {
  const template = validateCardTemplate(defaultCardTemplate);
  assert.deepEqual(template, defaultCardTemplate);
  assert.ok(!template.fields.includes("fee_balance"));
});

test("legacy card templates receive a positioned layout and support dynamic titles", () => {
  const { elements, titleField, ...legacyTemplate } = defaultCardTemplate;
  const upgraded = validateCardTemplate(legacyTemplate);

  assert.equal(upgraded.titleField, "custom");
  assert.equal(upgraded.elements.length, defaultCardTemplate.fields.length + 1);
  assert.deepEqual(upgraded.elements.map(({ field }) => field), ["title", ...defaultCardTemplate.fields]);
  assert.deepEqual(
    validateCardTemplate({ ...defaultCardTemplate, titleField: "full_name" }).titleField,
    "full_name",
  );
});

test("card element layouts enforce bounds, unique components, and safe styling", () => {
  const title = defaultCardTemplate.elements[0];
  assert.throws(
    () => validateCardTemplate({
      ...defaultCardTemplate,
      elements: [{ ...title, x: 90, width: 20 }, ...defaultCardTemplate.elements.slice(1)],
    }),
    /position, size, and text size/,
  );
  assert.throws(
    () => validateCardTemplate({
      ...defaultCardTemplate,
      elements: [...defaultCardTemplate.elements, title],
    }),
    /exactly one layout/,
  );
  assert.throws(
    () => validateCardTemplate({
      ...defaultCardTemplate,
      elements: [{ ...title, color: "url(javascript:alert(1))" }, ...defaultCardTemplate.elements.slice(1)],
    }),
    /alignment or text color/,
  );
  assert.throws(
    () => validateCardTemplate({ ...defaultCardTemplate, titleField: "fee_balance" }),
    /supported student field/,
  );
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

test("Jipra clearance presets are categorized, reusable, and exclude fee balances", () => {
  const temporary = clearanceCardPresets.find(({ template }) => template.cardType === "temporary");
  const permanent = clearanceCardPresets.find(({ template }) => template.cardType === "permanent");

  assert.equal(temporary.name, "Jipra Temporary Clearance");
  assert.equal(temporary.template.title, "TEMPORARY PERMISSION");
  assert.ok(temporary.template.fields.includes("clearance_deadline"));
  assert.ok(!temporary.template.fields.includes("clearance_stamp"));
  assert.equal(permanent.name, "Jipra Permanent Clearance");
  assert.equal(permanent.template.title, "FEES CLEARANCE CARD");
  assert.ok(permanent.template.fields.includes("clearance_stamp"));
  for (const { template } of clearanceCardPresets) {
    assert.ok(!template.fields.includes("fee_balance"));
    assert.equal(template.widthMm, 107);
    assert.equal(template.heightMm, 55);
  }
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
