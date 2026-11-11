const CLASSES = {
  CONFIG: {
    title: "Configuration needed",
    hint: "A required setting is missing or invalid. Ask a Control Center operator to check the platform settings, then try again.",
  },
  DATABASE: {
    title: "Database unavailable",
    hint: "Sirius could not reach its database. This is usually temporary — try again in a moment.",
  },
  SESSION: {
    title: "Session expired",
    hint: "Your sign-in session is no longer valid. Sign in again to continue.",
  },
  ENTITLEMENT: {
    title: "Plan limit reached",
    hint: "This action exceeds the school's current plan. Contact your administrator about the subscription.",
  },
  STORAGE: {
    title: "Upload service unavailable",
    hint: "The file storage service did not respond. Check your connection and try the upload again.",
  },
  UNEXPECTED: {
    title: "Something went wrong",
    hint: "An unexpected error interrupted this page. Try again; if it keeps happening, share the reference code below with support.",
  },
};

export function classifyError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const name = typeof error?.name === "string" ? error.name : "";
  const message = String(error?.message || "");
  let key = "UNEXPECTED";
  if (/APP_BASE_URL|CONFIG/i.test(code) || /not configured|configuration/i.test(message)) {
    key = "CONFIG";
  } else if (/^(ER_|ECONN|ETIMEDOUT|ENOTFOUND|EPIPE|PROTOCOL_)/i.test(code) || /database|tidb|connection (refused|reset|lost)/i.test(message)) {
    key = "DATABASE";
  } else if (/session|auth/i.test(name) || /session (expired|invalid)|sign in again|unauthorized/i.test(message)) {
    key = "SESSION";
  } else if (/entitlement|capacity/i.test(name) || /capacity|plan limit|subscription/i.test(message)) {
    key = "ENTITLEMENT";
  } else if (/storage|cloudinary|upload/i.test(name) || /upload|storage service/i.test(message)) {
    key = "STORAGE";
  }
  return { code: key, ...CLASSES[key] };
}