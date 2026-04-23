function normalizeContactType(contactType) {
  return contactType === "phone" ? "phone" : "email";
}

function normalizeContact(contactType, contact) {
  if (typeof contact !== "string") {
    return "";
  }

  const normalizedType = normalizeContactType(contactType);
  const raw = contact.trim();

  if (normalizedType === "phone") {
    const digits = raw.replace(/[^\d+]/g, "");
    return digits.startsWith("+") ? digits : `+${digits.replace(/[^\d]/g, "")}`;
  }

  return raw.toLowerCase();
}

function isValidContact(contactType, contact) {
  if (contactType === "phone") {
    return /^\+\d{10,15}$/.test(contact);
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
}

function normalizePriority(priority, partial = false) {
  if (typeof priority !== "string") {
    return partial ? undefined : "medium";
  }

  const value = priority.trim().toLowerCase();
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function normalizeRegistrationPayload(payload = {}) {
  return {
    name: typeof payload.name === "string" ? payload.name.trim() : "",
    contactType: normalizeContactType(payload.contactType),
    contact: normalizeContact(payload.contactType, payload.contact),
    password: typeof payload.password === "string" ? payload.password.trim() : ""
  };
}

function normalizeLoginPayload(payload = {}) {
  return {
    contactType: normalizeContactType(payload.contactType),
    contact: normalizeContact(payload.contactType, payload.contact),
    password: typeof payload.password === "string" ? payload.password.trim() : ""
  };
}

function normalizeVerificationPayload(payload = {}) {
  return {
    contactType: normalizeContactType(payload.contactType),
    contact: normalizeContact(payload.contactType, payload.contact),
    code: typeof payload.code === "string" ? payload.code.trim() : ""
  };
}

function normalizeTaskPayload(payload = {}, partial = false) {
  const normalizedTitle = typeof payload.title === "string" ? payload.title.trim() : "";
  const normalizedCategory =
    typeof payload.category === "string" ? payload.category.trim() : partial ? undefined : "";
  const normalizedDeadline =
    typeof payload.deadline === "string" ? payload.deadline.trim() : partial ? undefined : "";

  return {
    title: partial ? normalizedTitle || undefined : normalizedTitle,
    category: normalizedCategory,
    priority: normalizePriority(payload.priority, partial),
    deadline: normalizedDeadline,
    completed: typeof payload.completed === "boolean" ? payload.completed : undefined
  };
}

function buildContactKey(contactType, contact) {
  return `${normalizeContactType(contactType)}:${contact}`;
}

module.exports = {
  normalizeContactType,
  normalizeContact,
  isValidContact,
  normalizePriority,
  normalizeRegistrationPayload,
  normalizeLoginPayload,
  normalizeVerificationPayload,
  normalizeTaskPayload,
  buildContactKey
};
