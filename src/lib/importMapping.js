import { fieldAliases } from "./imports.js";

const fieldOrder = Object.keys(fieldAliases);
const fuzzyThreshold = 0.72;

export function normalizeHeader(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function similarity(left, right) {
  if (!left || !right) return 0;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      previous = saved;
    }
  }
  return 1 - row[right.length] / Math.max(left.length, right.length);
}

function shapeConfidence(field, values) {
  const samples = values.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (samples.length < 3) return 0;
  const nonEmptyRatio = samples.length / values.length;
  if (field === "student_account_no") {
    const uniqueRatio = new Set(samples.map((value) => value.toLowerCase())).size / samples.length;
    const accountShape = samples.filter((value) => /^[a-z0-9][a-z0-9._/-]*$/i.test(value)).length / samples.length;
    return nonEmptyRatio * uniqueRatio * accountShape;
  }
  if (field === "gender") {
    const known = new Set(["female", "male", "other", "f", "m"]);
    return nonEmptyRatio * samples.filter((value) => known.has(value.toLowerCase())).length / samples.length;
  }
  if (field === "parent_phone") {
    return nonEmptyRatio * samples.filter((value) => /^\+?[\d ()-]{7,32}$/.test(value)).length / samples.length;
  }
  if (field === "photo_url") {
    return nonEmptyRatio * samples.filter((value) => /^https?:\/\/\S+$/i.test(value)).length / samples.length;
  }
  return 0;
}

export function suggestColumnMapping(headers, sampleRows = []) {
  const suggestions = {};
  const usedHeaders = new Set();
  const candidates = [];

  for (const field of fieldOrder) {
    const aliases = fieldAliases[field].map(normalizeHeader);
    for (const header of headers) {
      const normalized = normalizeHeader(header);
      if (!normalized) continue;
      const exact = aliases.includes(normalized);
      const nameScore = exact ? 1 : Math.max(...aliases.map((alias) => similarity(normalized, alias)));
      const shape = shapeConfidence(field, sampleRows.map((row) => row?.[header]));
      if (exact || nameScore >= fuzzyThreshold || shape >= 0.8) {
        const confidence = exact ? 0.99 : nameScore >= fuzzyThreshold
          ? Math.min(0.94, 0.68 + nameScore * 0.22 + shape * 0.1)
          : 0.55 + shape * 0.2;
        candidates.push({ field, header, confidence, reason: exact ? "header" : nameScore >= fuzzyThreshold ? "fuzzy header" : "data shape" });
      }
    }
  }

  candidates.sort((left, right) => right.confidence - left.confidence);
  for (const candidate of candidates) {
    if (suggestions[candidate.field] || usedHeaders.has(candidate.header)) continue;
    suggestions[candidate.field] = candidate;
    usedHeaders.add(candidate.header);
  }

  return Object.fromEntries(fieldOrder.map((field) => [
    field,
    suggestions[field] || { field, header: "", confidence: 0, reason: "unmapped" },
  ]));
}

export function validateColumnMapping(mapping, headers) {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new Error("Column mapping must be an object.");
  }
  const result = {};
  const usedHeaders = new Set();
  for (const field of fieldOrder) {
    const header = mapping[field] || "";
    if (typeof header !== "string" || (header && !headers.includes(header))) {
      throw new Error(`The selected source column for ${field.replaceAll("_", " ")} is not in this file.`);
    }
    if (header && usedHeaders.has(header)) throw new Error("A source column can only be mapped once.");
    if (header) usedHeaders.add(header);
    result[field] = header;
  }
  for (const field of ["student_account_no", "first_name", "last_name"]) {
    if (!result[field]) throw new Error(`${field.replaceAll("_", " ")} must be mapped.`);
  }
  return result;
}
