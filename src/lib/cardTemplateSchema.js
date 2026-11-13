export const cardFields = [
  { key: "school_logo", label: "School logo" },
  { key: "school_name", label: "School name" },
  { key: "school_term", label: "Current school term" },
  { key: "school_phone", label: "School phone" },
  { key: "full_name", label: "Student name" },
  { key: "student_account_no", label: "Student account number" },
  { key: "class_name", label: "Class" },
  { key: "stream", label: "Stream" },
  { key: "student_type", label: "Student type (DAY/BOARDING)" },
  { key: "fee_balance", label: "Fees balance" },
  { key: "photo_url", label: "Student photo" },
  { key: "qr_code", label: "Verification QR code" },
  { key: "clearance_deadline", label: "Clearance deadline" },
  { key: "issued_on", label: "Issued date" },
  { key: "signature_line", label: "Signature line" },
  { key: "accounts_department", label: "Accounts department" },
  { key: "clearance_stamp", label: "Clearance stamp" },
];

export const cardElementDefaults = {
  title: { x: 25, y: 27, width: 50, height: 8, fontSize: 15, align: "center", color: "text" },
  school_logo: { x: 78, y: 3, width: 15, height: 24, fontSize: 10, align: "center", color: "muted" },
  school_name: { x: 25, y: 3, width: 51, height: 10, fontSize: 18, align: "center", color: "text" },
  school_term: { x: 26, y: 14, width: 49, height: 5, fontSize: 11, align: "center", color: "text" },
  school_phone: { x: 26, y: 20, width: 49, height: 5, fontSize: 10, align: "center", color: "text" },
  full_name: { x: 43, y: 37, width: 43, height: 8, fontSize: 14, align: "center", color: "text" },
  student_account_no: { x: 4, y: 37, width: 16, height: 7, fontSize: 11, align: "center", color: "text" },
  class_name: { x: 21, y: 37, width: 10, height: 7, fontSize: 11, align: "center", color: "text" },
  stream: { x: 32, y: 37, width: 9, height: 7, fontSize: 11, align: "center", color: "text" },
  student_type: { x: 4, y: 48, width: 24, height: 7, fontSize: 11, align: "left", color: "text" },
  fee_balance: { x: 30, y: 48, width: 24, height: 7, fontSize: 11, align: "left", color: "text" },
  photo_url: { x: 4, y: 4, width: 18, height: 29, fontSize: 14, align: "center", color: "#43846a" },
  qr_code: { x: 88, y: 36, width: 9, height: 16, fontSize: 8, align: "center", color: "muted" },
  clearance_deadline: { x: 30, y: 48, width: 44, height: 7, fontSize: 10, align: "center", color: "text" },
  issued_on: { x: 77, y: 86, width: 19, height: 6, fontSize: 9, align: "right", color: "text" },
  signature_line: { x: 4, y: 82, width: 42, height: 8, fontSize: 10, align: "left", color: "text" },
  accounts_department: { x: 44, y: 82, width: 24, height: 8, fontSize: 10, align: "center", color: "text" },
  clearance_stamp: { x: 58, y: 48, width: 26, height: 16, fontSize: 18, align: "center", color: "#344c9b" },
};

const defaultLabels = {
  school_term: "TERM | ",
  school_phone: "Tel: ",
  class_name: "Class: ",
  stream: "Stream: ",
  student_type: "Type: ",
  fee_balance: "Fees Balance: ",
  clearance_deadline: "Deadline: ",
  issued_on: "Issued: ",
  signature_line: "Sign: ",
};

for (const [field, element] of Object.entries(cardElementDefaults)) {
  element.bold = ["title", "school_name", "full_name"].includes(field);
  element.italic = false;
  element.underline = false;
  element.strikethrough = false;
  element.rotation = 0;
  element.label = {
    visible: Boolean(defaultLabels[field]),
    text: defaultLabels[field] || "",
    style: null,
  };
  element.visible = true;
  element.value = { visible: true, custom: false, text: "", style: null };
}

const allowedFields = new Set(cardFields.map(({ key }) => key));
const allowedElementFields = new Set(["title", ...allowedFields]);
const titleSources = new Set(["custom", "school_name", "full_name", "student_account_no", "class_name", "stream", "student_type"]);
const alignments = new Set(["left", "center", "right"]);
const colors = new Set(["accent", "text", "muted"]);
const cardTypes = new Set(["general", "temporary", "permanent"]);
const cardTemplateSchemaVersion = 3;
const allowedTemplateKeys = new Set([
  "schemaVersion",
  "title",
  "titleField",
  "cardType",
  "widthMm",
  "heightMm",
  "accentColor",
  "backgroundColor",
  "stampDepartment",
  "fields",
  "elements",
]);
const defaultFields = [
  "school_name",
  "full_name",
  "student_account_no",
  "class_name",
  "stream",
  "fee_balance",
  "photo_url",
  "qr_code",
];

export const defaultCardTemplate = {
  schemaVersion: cardTemplateSchemaVersion,
  title: "Student identity",
  titleField: "custom",
  cardType: "general",
  widthMm: 90,
  heightMm: 55,
  accentColor: "#2f6d58",
  backgroundColor: "#ffffff",
  stampDepartment: "ACCOUNTS DEPT.",
  fields: defaultFields,
  elements: ["title", ...defaultFields].map((field) => ({ field, ...cardElementDefaults[field] })),
};

export class CardTemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = "CardTemplateError";
    this.status = 400;
  }
}

function validateElement(element) {
  if (!element || typeof element !== "object" || Array.isArray(element)
    || Object.keys(element).some((key) => ![
      "field", "x", "y", "width", "height", "fontSize", "align", "color",
      "bold", "italic", "underline", "strikethrough", "rotation", "visible", "label", "value",
    ].includes(key))
    || !allowedElementFields.has(element.field)) {
    throw new CardTemplateError("The card template contains an unsupported component.");
  }
  const { x, y, width, height, fontSize } = element;
  if (![x, y, width, height, fontSize].every(Number.isFinite)
    || x < 0 || y < 0 || width < 3 || height < 3
    || x > 100 || y > 100 || width > 100 || height > 100
    || x + width > 100 || y + height > 100
    || fontSize < 6 || fontSize > 48) {
    throw new CardTemplateError("Component position, size, and text size must stay within the card.");
  }
  const rotation = element.rotation ?? 0;
  if (!Number.isFinite(rotation) || rotation < -45 || rotation > 45) {
    throw new CardTemplateError("Component rotation must be between -45 and 45 degrees.");
  }
  if (!alignments.has(element.align) || typeof element.color !== "string"
    || !(colors.has(element.color) || /^#[0-9a-f]{6}$/i.test(element.color))) {
    throw new CardTemplateError("Component alignment or text color is invalid.");
  }
  if (["bold", "italic", "underline", "strikethrough"].some(
    (key) => element[key] !== undefined && typeof element[key] !== "boolean",
  )) {
    throw new CardTemplateError("Text formatting options must be enabled or disabled.");
  }
  const defaultElement = cardElementDefaults[element.field];
  if (element.visible !== undefined && typeof element.visible !== "boolean") {
    throw new CardTemplateError("Component visibility must be enabled or disabled.");
  }
  if (element.label !== undefined && (!element.label || typeof element.label !== "object"
    || Array.isArray(element.label))) {
    throw new CardTemplateError("Component label settings are invalid.");
  }
  if (element.value !== undefined && (!element.value || typeof element.value !== "object"
    || Array.isArray(element.value))) {
    throw new CardTemplateError("Component value settings are invalid.");
  }
  const label = { ...defaultElement.label, ...(element.label || {}) };
  if (!label || typeof label !== "object" || Array.isArray(label)
    || Object.keys(label).some((key) => !["visible", "text", "style"].includes(key))
    || typeof label.visible !== "boolean"
    || typeof label.text !== "string" || label.text.length > 80) {
    throw new CardTemplateError("Component label settings are invalid.");
  }
  const value = { ...defaultElement.value, ...(element.value || {}) };
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["visible", "custom", "text", "style"].includes(key))
    || typeof value.visible !== "boolean"
    || typeof value.custom !== "boolean"
    || typeof value.text !== "string" || value.text.length > 200) {
    throw new CardTemplateError("Component value settings are invalid.");
  }
  const componentVisible = element.visible ?? defaultElement.visible;
  if ((element.field === "full_name" && (!componentVisible || !value.visible))
    || (element.field === "qr_code" && !componentVisible)) {
    throw new CardTemplateError("Student name and verification QR must remain visible on every card.");
  }

  function validatePartStyle(style) {
    if (style === null || style === undefined) return null;
    if (!style || typeof style !== "object" || Array.isArray(style)
      || Object.keys(style).some((key) => ![
        "fontSize", "color", "bold", "italic", "underline", "strikethrough",
      ].includes(key))) {
      throw new CardTemplateError("Label and value styling settings are invalid.");
    }
    if (style.fontSize !== undefined
      && (!Number.isFinite(style.fontSize) || style.fontSize < 6 || style.fontSize > 48)) {
      throw new CardTemplateError("Label and value text size must be between 6 and 48 pixels.");
    }
    if (style.color !== undefined && (typeof style.color !== "string"
      || !(colors.has(style.color) || /^#[0-9a-f]{6}$/i.test(style.color)))) {
      throw new CardTemplateError("Label and value text color is invalid.");
    }
    if (["bold", "italic", "underline", "strikethrough"].some(
      (key) => style[key] !== undefined && typeof style[key] !== "boolean",
    )) {
      throw new CardTemplateError("Label and value formatting options must be enabled or disabled.");
    }
    return {
      ...(style.fontSize === undefined ? {} : { fontSize: Math.round(style.fontSize * 100) / 100 }),
      ...(style.color === undefined ? {} : {
        color: colors.has(style.color) ? style.color : style.color.toLowerCase(),
      }),
      ...Object.fromEntries(["bold", "italic", "underline", "strikethrough"]
        .filter((key) => style[key] !== undefined)
        .map((key) => [key, style[key]])),
    };
  }

  return {
    field: element.field,
    visible: element.visible ?? defaultElement.visible,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    fontSize: Math.round(fontSize * 100) / 100,
    rotation: Math.round(rotation * 100) / 100,
    align: element.align,
    color: colors.has(element.color) ? element.color : element.color.toLowerCase(),
    bold: element.bold ?? cardElementDefaults[element.field].bold,
    italic: element.italic ?? cardElementDefaults[element.field].italic,
    underline: element.underline ?? cardElementDefaults[element.field].underline,
    strikethrough: element.strikethrough ?? cardElementDefaults[element.field].strikethrough,
    label: {
      visible: label.visible,
      text: label.text,
      style: validatePartStyle(label.style),
    },
    value: {
      visible: value.visible,
      custom: value.custom,
      text: value.text,
      style: validatePartStyle(value.style),
    },
  };
}

export function validateCardTemplate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CardTemplateError("A valid card template object is required.");
  }
  if (Object.keys(value).some((key) => !allowedTemplateKeys.has(key))) {
    throw new CardTemplateError("The card template contains an unsupported setting.");
  }
  const schemaVersion = value.schemaVersion ?? 1;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > cardTemplateSchemaVersion) {
    throw new CardTemplateError("The card template version is not supported.");
  }
  if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 100) {
    throw new CardTemplateError("Card title must be between 1 and 100 characters.");
  }
  const cardType = value.cardType ?? "general";
  if (typeof cardType !== "string" || !cardTypes.has(cardType)) {
    throw new CardTemplateError("Choose a supported card type.");
  }
  if (!Number.isInteger(value.widthMm) || value.widthMm < 50 || value.widthMm > 150
    || !Number.isInteger(value.heightMm) || value.heightMm < 30 || value.heightMm > 100) {
    throw new CardTemplateError("Card size must be 50–150 mm wide and 30–100 mm high.");
  }
  if (typeof value.accentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(value.accentColor)
    || typeof value.backgroundColor !== "string" || !/^#[0-9a-f]{6}$/i.test(value.backgroundColor)) {
    throw new CardTemplateError("Card colors must be six-digit hexadecimal values.");
  }
  const stampDepartment = value.stampDepartment ?? "ACCOUNTS DEPT.";
  if (typeof stampDepartment !== "string" || stampDepartment.trim().length > 80) {
    throw new CardTemplateError("Stamp department must be 80 characters or fewer.");
  }
  if (!Array.isArray(value.fields) || value.fields.some((field) => typeof field !== "string" || !allowedFields.has(field))) {
    throw new CardTemplateError("The card template contains an unsupported field.");
  }
  if (new Set(value.fields).size !== value.fields.length) {
    throw new CardTemplateError("A card field can only be selected once.");
  }
  if (!value.fields.includes("full_name") || !value.fields.includes("qr_code")) {
    throw new CardTemplateError("Student name and verification QR code are required.");
  }
  const titleField = value.titleField ?? "custom";
  if (typeof titleField !== "string" || !titleSources.has(titleField)) {
    throw new CardTemplateError("Choose a supported student field for the card title.");
  }

  const fields = [...value.fields];
  if (schemaVersion < 2 && !fields.includes("fee_balance")) {
    fields.push("fee_balance");
  }
  const expectedFields = new Set(["title", ...fields]);
  let elementValues = value.elements;
  if (elementValues === undefined) {
    elementValues = [...expectedFields].map((field) => ({ field, ...cardElementDefaults[field] }));
  } else if (schemaVersion < 2 && Array.isArray(elementValues)
    && !elementValues.some((element) => element?.field === "fee_balance")) {
    elementValues = [...elementValues, { field: "fee_balance", ...cardElementDefaults.fee_balance }];
  }
  if (!Array.isArray(elementValues) || elementValues.length !== expectedFields.size) {
    throw new CardTemplateError("Every visible card component must have exactly one layout.");
  }
  const elements = elementValues.map(validateElement);
  if (new Set(elements.map(({ field }) => field)).size !== elements.length
    || elements.some(({ field }) => !expectedFields.has(field))
    || [...expectedFields].some((field) => !elements.some((element) => element.field === field))) {
    throw new CardTemplateError("Card components must match the selected fields exactly.");
  }

  return {
    schemaVersion: cardTemplateSchemaVersion,
    title: value.title.trim(),
    titleField,
    cardType,
    widthMm: value.widthMm,
    heightMm: value.heightMm,
    accentColor: value.accentColor.toLowerCase(),
    backgroundColor: value.backgroundColor.toLowerCase(),
    stampDepartment: stampDepartment.trim(),
    fields,
    elements,
  };
}

function createClearancePreset(cardType, title, extraField) {
  const fields = [
    "school_logo",
    "school_name",
    "school_term",
    "school_phone",
    "student_account_no",
    "class_name",
    "stream",
    "student_type",
    "fee_balance",
    "full_name",
    "photo_url",
    "qr_code",
    "issued_on",
    "signature_line",
    "accounts_department",
    extraField,
  ];
  return validateCardTemplate({
    schemaVersion: cardTemplateSchemaVersion,
    title,
    titleField: "custom",
    cardType,
    widthMm: 107,
    heightMm: 55,
    accentColor: "#2f6d58",
    backgroundColor: "#f7c1d3",
    stampDepartment: "ACCOUNTS DEPT.",
    fields,
    elements: ["title", ...fields].map((field) => {
      const clearanceLayout = {
        title: { x: 26, y: 26, width: 61, height: 6, fontSize: 13 },
        school_logo: { x: 82, y: 5, width: 13, height: 19, fontSize: 10 },
        school_name: { x: 20, y: 2, width: 61, height: 9, fontSize: 14 },
        school_term: { x: 20, y: 12, width: 61, height: 5, fontSize: 9 },
        school_phone: { x: 20, y: 18, width: 61, height: 5, fontSize: 8 },
        photo_url: { x: 4, y: 7, width: 14, height: 28, fontSize: 14 },
        student_account_no: { x: 3, y: 37, width: 17, height: 6, fontSize: 9 },
        class_name: { x: 21, y: 37, width: 8, height: 6, fontSize: 9 },
        stream: { x: 30, y: 37, width: 10, height: 6, fontSize: 9 },
        full_name: { x: 40, y: 32, width: 24, height: 7, fontSize: 11 },
        student_type: { x: 4, y: 48, width: 17, height: 6, fontSize: 9 },
        fee_balance: { x: 22, y: 48, width: 27, height: 6, fontSize: 9 },
        clearance_deadline: { x: 50, y: 48, width: 30, height: 6, fontSize: 9 },
        issued_on: { x: 78, y: 64, width: 18, height: 5, fontSize: 8 },
        signature_line: { x: 4, y: 70, width: 38, height: 6, fontSize: 8 },
        accounts_department: { x: 43, y: 70, width: 25, height: 6, fontSize: 8 },
        clearance_stamp: { x: 64, y: 37, width: 31, height: 27, fontSize: 12 },
        qr_code: { x: 88, y: 72, width: 9, height: 17, fontSize: 8 },
      };
      return {
        field,
        ...cardElementDefaults[field],
        ...clearanceLayout[field],
      };
    }),
  });
}

export const clearanceCardPresets = [
  {
    name: "Jipra Temporary Clearance",
    template: createClearancePreset("temporary", "TEMPORARY PERMISSION", "clearance_deadline"),
  },
  {
    name: "Jipra Permanent Clearance",
    template: createClearancePreset("permanent", "FEES CLEARANCE CARD", "clearance_stamp"),
  },
];
