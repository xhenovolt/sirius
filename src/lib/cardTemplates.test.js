import test from "node:test";
import assert from "node:assert/strict";

import {
  cardElementDefaults,
  clearanceCardPresets,
  defaultCardTemplate,
  validateCardTemplate,
} from "./cardTemplateSchema.js";

test("card template accepts only safe, available fields and bounded layout values", () => {
  const template = validateCardTemplate(defaultCardTemplate);
  assert.deepEqual(template, defaultCardTemplate);
  assert.ok(template.fields.includes("fee_balance"));
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

test("legacy templates gain fee balance unless a current template explicitly removes it", () => {
  const legacy = {
    ...defaultCardTemplate,
    schemaVersion: undefined,
    fields: defaultCardTemplate.fields.filter((field) => field !== "fee_balance"),
    elements: defaultCardTemplate.elements.filter((element) => element.field !== "fee_balance"),
  };
  const upgraded = validateCardTemplate(legacy);

  assert.equal(upgraded.schemaVersion, 3);
  assert.ok(upgraded.fields.includes("fee_balance"));
  assert.ok(upgraded.elements.some((element) => element.field === "fee_balance"));
  assert.ok(!validateCardTemplate({
    ...defaultCardTemplate,
    fields: defaultCardTemplate.fields.filter((field) => field !== "fee_balance"),
    elements: defaultCardTemplate.elements.filter((element) => element.field !== "fee_balance"),
  }).fields.includes("fee_balance"));
});

test("version 2 templates keep explicit fee opt-outs while older layouts receive editable text defaults", () => {
  const versionTwoWithoutFees = {
    ...defaultCardTemplate,
    schemaVersion: 2,
    fields: defaultCardTemplate.fields.filter((field) => field !== "fee_balance"),
    elements: defaultCardTemplate.elements
      .filter((element) => element.field !== "fee_balance")
      .map(({ label, value, visible, ...element }) => element),
  };
  const upgraded = validateCardTemplate(versionTwoWithoutFees);
  const classElement = upgraded.elements.find(({ field }) => field === "class_name");

  assert.equal(upgraded.schemaVersion, 3);
  assert.ok(!upgraded.fields.includes("fee_balance"));
  assert.equal(classElement.label.text, "Class: ");
  assert.equal(classElement.label.visible, true);
  assert.equal(classElement.value.custom, false);
});

test("component label and value text and formatting can be customized independently", () => {
  const fields = [...defaultCardTemplate.fields, "signature_line"];
  const elements = [
    ...defaultCardTemplate.elements,
    { field: "signature_line", ...cardElementDefaults.signature_line },
  ];
  const template = validateCardTemplate({
    ...defaultCardTemplate,
    fields,
    elements: elements.map((element) => {
      if (element.field === "stream") {
        return {
          ...element,
          label: { visible: false, text: "Stream: ", style: { bold: true, color: "#112233" } },
          value: { custom: false, text: "", style: { fontSize: 16, italic: true } },
        };
      }
      if (element.field === "signature_line") {
        return {
          ...element,
          value: { custom: true, text: "____________________________", style: { underline: true } },
        };
      }
      return element;
    }),
  });
  const stream = template.elements.find(({ field }) => field === "stream");
  const signature = template.elements.find(({ field }) => field === "signature_line");

  assert.equal(stream.label.visible, false);
  assert.equal(stream.label.style.color, "#112233");
  assert.equal(stream.value.style.fontSize, 16);
  assert.equal(stream.value.style.italic, true);
  assert.equal(signature.value.custom, true);
  assert.equal(signature.value.text, "____________________________");
  assert.equal(signature.value.style.underline, true);
  assert.equal(stream.visible, true);
  assert.equal(stream.value.visible, true);
  assert.equal(stream.label.visible, false);
});

test("component, label, and value visibility are independently configurable", () => {
  const template = validateCardTemplate({
    ...defaultCardTemplate,
    elements: defaultCardTemplate.elements.map((element) => (
      element.field === "stream"
        ? {
          ...element,
          visible: false,
          label: { ...element.label, visible: true },
          value: { ...element.value, visible: false },
        }
        : element
    )),
  });
  const stream = template.elements.find(({ field }) => field === "stream");

  assert.equal(stream.visible, false);
  assert.equal(stream.label.visible, true);
  assert.equal(stream.value.visible, false);
});

test("student name and QR remain visible identity components", () => {
  assert.throws(
    () => validateCardTemplate({
      ...defaultCardTemplate,
      elements: defaultCardTemplate.elements.map((element) => (
        element.field === "full_name" ? { ...element, value: { ...element.value, visible: false } } : element
      )),
    }),
    /Student name and verification QR must remain visible/,
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
  assert.throws(
    () => validateCardTemplate({
      ...defaultCardTemplate,
      elements: defaultCardTemplate.elements.map((element, index) => (
        index === 0 ? { ...element, underline: "yes" } : element
      )),
    }),
    /formatting options/,
  );
  assert.throws(
    () => validateCardTemplate({
      ...defaultCardTemplate,
      elements: defaultCardTemplate.elements.map((element, index) => (
        index === 0 ? { ...element, rotation: 90 } : element
      )),
    }),
    /rotation must be between/,
  );
  assert.throws(
    () => validateCardTemplate({
      ...defaultCardTemplate,
      elements: defaultCardTemplate.elements.map((element) => (
        element.field === "stream"
          ? { ...element, value: { custom: true, text: "<script>", style: { color: "url(javascript:)" } } }
          : element
      )),
    }),
    /Label and value text color/,
  );
});

test("fee balance can be included by default or explicitly removed from a template", () => {
  const withoutBalance = validateCardTemplate({
    ...defaultCardTemplate,
    fields: defaultCardTemplate.fields.filter((field) => field !== "fee_balance"),
    elements: defaultCardTemplate.elements.filter((element) => element.field !== "fee_balance"),
  });

  assert.ok(defaultCardTemplate.fields.includes("fee_balance"));
  assert.ok(!withoutBalance.fields.includes("fee_balance"));
  assert.throws(
    () => validateCardTemplate({ ...defaultCardTemplate, html: "<script>" }),
    /unsupported setting/,
  );
});

test("Jipra clearance presets are categorized, reusable, and include selectable fee balances", () => {
  const temporary = clearanceCardPresets.find(({ template }) => template.cardType === "temporary");
  const permanent = clearanceCardPresets.find(({ template }) => template.cardType === "permanent");

  assert.equal(temporary.name, "Jipra Temporary Clearance");
  assert.equal(temporary.template.title, "TEMPORARY PERMISSION");
  assert.ok(temporary.template.fields.includes("clearance_deadline"));
  assert.ok(!temporary.template.fields.includes("clearance_stamp"));
  assert.ok(temporary.template.fields.includes("fee_balance"));
  assert.equal(permanent.name, "Jipra Permanent Clearance");
  assert.equal(permanent.template.title, "FEES CLEARANCE CARD");
  assert.ok(permanent.template.fields.includes("clearance_stamp"));
  assert.ok(permanent.template.fields.includes("fee_balance"));
  for (const { template } of clearanceCardPresets) {
    assert.equal(template.widthMm, 107);
    assert.equal(template.heightMm, 55);
  }
});

test("text formatting, user-selected stamp color, department, and rotation survive validation", () => {
  const template = validateCardTemplate({
    ...defaultCardTemplate,
    stampDepartment: "FINANCE OFFICE",
    elements: defaultCardTemplate.elements.map((element) => (
      element.field === "title"
        ? { ...element, bold: true, italic: true, underline: true, strikethrough: true, rotation: 12, color: "#993344" }
        : element
    )),
  });
  const title = template.elements.find(({ field }) => field === "title");

  assert.equal(template.stampDepartment, "FINANCE OFFICE");
  assert.equal(title.bold, true);
  assert.equal(title.italic, true);
  assert.equal(title.underline, true);
  assert.equal(title.strikethrough, true);
  assert.equal(title.rotation, 12);
  assert.equal(title.color, "#993344");
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
