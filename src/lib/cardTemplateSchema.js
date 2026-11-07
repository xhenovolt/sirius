export const cardFields = [
  { key: "school_name", label: "School name" },
  { key: "full_name", label: "Student name" },
  { key: "student_account_no", label: "Student account number" },
  { key: "class_name", label: "Class" },
  { key: "stream", label: "Stream" },
  { key: "photo_url", label: "Student photo" },
  { key: "qr_code", label: "Verification QR code" },
];

export const defaultCardTemplate = {
  title: "Student identity",
  widthMm: 90,
  heightMm: 55,
  accentColor: "#2f6d58",
  backgroundColor: "#ffffff",
  fields: cardFields.map(({ key }) => key),
};

const allowedFields = new Set(cardFields.map(({ key }) => key));
const allowedTemplateKeys = new Set([
  "title",
  "widthMm",
  "heightMm",
  "accentColor",
  "backgroundColor",
  "fields",
]);

export class CardTemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = "CardTemplateError";
    this.status = 400;
  }
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
  return {
    title: value.title.trim(),
    widthMm: value.widthMm,
    heightMm: value.heightMm,
    accentColor: value.accentColor.toLowerCase(),
    backgroundColor: value.backgroundColor.toLowerCase(),
    fields: [...value.fields],
  };
}
