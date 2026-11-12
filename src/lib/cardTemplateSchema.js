export const cardFields = [
  { key: "school_name", label: "School name" },
  { key: "full_name", label: "Student name" },
  { key: "student_account_no", label: "Student account number" },
  { key: "class_name", label: "Class" },
  { key: "stream", label: "Stream" },
  { key: "photo_url", label: "Student photo" },
  { key: "qr_code", label: "Verification QR code" },
];

export const cardElementDefaults = {
  title: { x: 4, y: 4, width: 60, height: 15, fontSize: 20, align: "left", color: "accent" },
  school_name: { x: 4, y: 22, width: 60, height: 12, fontSize: 10, align: "left", color: "#63736c" },
  full_name: { x: 4, y: 36, width: 59, height: 14, fontSize: 16, align: "left", color: "#172522" },
  student_account_no: { x: 4, y: 53, width: 58, height: 10, fontSize: 10, align: "left", color: "#172522" },
  class_name: { x: 4, y: 66, width: 45, height: 10, fontSize: 10, align: "left", color: "#172522" },
  stream: { x: 4, y: 78, width: 45, height: 10, fontSize: 10, align: "left", color: "#172522" },
  photo_url: { x: 69, y: 5, width: 26, height: 41, fontSize: 14, align: "center", color: "#43846a" },
  qr_code: { x: 70, y: 53, width: 25, height: 43, fontSize: 8, align: "center", color: "#63736c" },
};

const allowedFields = new Set(cardFields.map(({ key }) => key));
const allowedElementFields = new Set(["title", ...allowedFields]);
const titleSources = new Set(["custom", "school_name", "full_name", "student_account_no", "class_name", "stream"]);
const alignments = new Set(["left", "center", "right"]);
const colors = new Set(["accent", "text", "muted"]);
const allowedTemplateKeys = new Set([
  "title",
  "titleField",
  "widthMm",
  "heightMm",
  "accentColor",
  "backgroundColor",
  "fields",
  "elements",
]);
const defaultFields = cardFields.map(({ key }) => key);

export const defaultCardTemplate = {
  title: "Student identity",
  titleField: "custom",
  widthMm: 90,
  heightMm: 55,
  accentColor: "#2f6d58",
  backgroundColor: "#ffffff",
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
    || Object.keys(element).some((key) => !["field", "x", "y", "width", "height", "fontSize", "align", "color"].includes(key))
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
  if (!alignments.has(element.align) || typeof element.color !== "string"
    || !(colors.has(element.color) || /^#[0-9a-f]{6}$/i.test(element.color))) {
    throw new CardTemplateError("Component alignment or text color is invalid.");
  }
  return {
    field: element.field,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    fontSize: Math.round(fontSize * 100) / 100,
    align: element.align,
    color: colors.has(element.color) ? element.color : element.color.toLowerCase(),
  };
}

export function validateCardTemplate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CardTemplateError("A valid card template object is required.");
  }
  if (Object.keys(value).some((key) => !allowedTemplateKeys.has(key))) {
    throw new CardTemplateError("The card template contains an unsupported setting.");
  }
  if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 100) {
    throw new CardTemplateError("Card title must be between 1 and 100 characters.");
  }
  if (!Number.isInteger(value.widthMm) || value.widthMm < 50 || value.widthMm > 150
    || !Number.isInteger(value.heightMm) || value.heightMm < 30 || value.heightMm > 100) {
    throw new CardTemplateError("Card size must be 50–150 mm wide and 30–100 mm high.");
  }
  if (typeof value.accentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(value.accentColor)
    || typeof value.backgroundColor !== "string" || !/^#[0-9a-f]{6}$/i.test(value.backgroundColor)) {
    throw new CardTemplateError("Card colors must be six-digit hexadecimal values.");
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

  const expectedFields = new Set(["title", ...value.fields]);
  const elementValues = value.elements === undefined
    ? [...expectedFields].map((field) => ({ field, ...cardElementDefaults[field] }))
    : value.elements;
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
    title: value.title.trim(),
    titleField,
    widthMm: value.widthMm,
    heightMm: value.heightMm,
    accentColor: value.accentColor.toLowerCase(),
    backgroundColor: value.backgroundColor.toLowerCase(),
    fields: [...value.fields],
    elements,
  };
}
