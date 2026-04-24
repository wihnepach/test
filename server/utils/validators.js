const { AUTH_CONTACT_TYPE } = require("../constants/auth.constants");
const { TASK_PRIORITY, TASK_PRIORITY_VALUES } = require("../constants/task.constants");

function normalizeContactType(contactType) {
  return contactType === AUTH_CONTACT_TYPE.PHONE
    ? AUTH_CONTACT_TYPE.PHONE
    : AUTH_CONTACT_TYPE.EMAIL;
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
  if (contactType === AUTH_CONTACT_TYPE.PHONE) {
    return /^\+\d{10,15}$/.test(contact);
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
}

function normalizePriority(priority, partial = false) {
  if (typeof priority !== "string") {
    return partial ? undefined : TASK_PRIORITY.MEDIUM;
  }

  const value = priority.trim().toLowerCase();
  return TASK_PRIORITY_VALUES.includes(value) ? value : undefined;
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
  const normalizedNotes =
    typeof payload.notes === "string" ? payload.notes.trim() : partial ? undefined : "";
  const normalizedDeadline =
    typeof payload.deadline === "string" ? payload.deadline.trim() : partial ? undefined : "";

  return {
    title: partial ? normalizedTitle || undefined : normalizedTitle,
    category: normalizedCategory,
    notes: normalizedNotes,
    priority: normalizePriority(payload.priority, partial),
    deadline: normalizedDeadline,
    completed: typeof payload.completed === "boolean" ? payload.completed : undefined
  };
}

function validateRegistrationPayload(payload = {}) {
  const normalized = normalizeRegistrationPayload(payload);
  const details = [];

  if (!normalized.name) {
    details.push({ field: "name", issue: "required" });
  } else if (normalized.name.length < 2 || normalized.name.length > 80) {
    details.push({ field: "name", issue: "length must be between 2 and 80" });
  }

  if (!normalized.contact) {
    details.push({ field: "contact", issue: "required" });
  } else if (!isValidContact(normalized.contactType, normalized.contact)) {
    details.push({ field: "contact", issue: "invalid format" });
  }

  if (!normalized.password) {
    details.push({ field: "password", issue: "required" });
  } else if (normalized.password.length < 8 || normalized.password.length > 72) {
    details.push({ field: "password", issue: "length must be between 8 and 72" });
  }

  return details;
}

function validateLoginPayload(payload = {}) {
  const normalized = normalizeLoginPayload(payload);
  const details = [];

  if (!normalized.contact) {
    details.push({ field: "contact", issue: "required" });
  } else if (!isValidContact(normalized.contactType, normalized.contact)) {
    details.push({ field: "contact", issue: "invalid format" });
  }

  if (!normalized.password) {
    details.push({ field: "password", issue: "required" });
  } else if (normalized.password.length > 72) {
    details.push({ field: "password", issue: "must be 72 chars or less" });
  }

  return details;
}

function validateVerificationPayload(payload = {}) {
  const normalized = normalizeVerificationPayload(payload);
  const details = [];

  if (!normalized.contact) {
    details.push({ field: "contact", issue: "required" });
  } else if (!isValidContact(normalized.contactType, normalized.contact)) {
    details.push({ field: "contact", issue: "invalid format" });
  }

  if (!normalized.code) {
    details.push({ field: "code", issue: "required" });
  } else if (!/^\d{6}$/.test(normalized.code)) {
    details.push({ field: "code", issue: "must be a 6-digit string" });
  }

  return details;
}

function validateTaskPayload(payload = {}, partial = false) {
  const details = [];

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "title")) {
    const title = typeof payload.title === "string" ? payload.title.trim() : "";

    if (!title) {
      details.push({ field: "title", issue: "required" });
    } else if (title.length > 160) {
      details.push({ field: "title", issue: "must be 160 chars or less" });
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "category") && payload.category !== undefined) {
    if (typeof payload.category !== "string") {
      details.push({ field: "category", issue: "must be a string" });
    } else if (payload.category.trim().length > 80) {
      details.push({ field: "category", issue: "must be 80 chars or less" });
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "notes") && payload.notes !== undefined) {
    if (typeof payload.notes !== "string") {
      details.push({ field: "notes", issue: "must be a string" });
    } else if (payload.notes.trim().length > 1000) {
      details.push({ field: "notes", issue: "must be 1000 chars or less" });
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "priority") && payload.priority !== undefined) {
    if (typeof payload.priority !== "string") {
      details.push({ field: "priority", issue: "must be a string" });
    } else if (!TASK_PRIORITY_VALUES.includes(payload.priority.trim().toLowerCase())) {
      details.push({ field: "priority", issue: "must be one of: low, medium, high" });
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deadline") && payload.deadline !== undefined) {
    if (typeof payload.deadline !== "string") {
      details.push({ field: "deadline", issue: "must be a string" });
    } else {
      const deadline = payload.deadline.trim();
      if (deadline && Number.isNaN(Date.parse(deadline))) {
        details.push({ field: "deadline", issue: "must be a valid date" });
      }
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, "completed") &&
    payload.completed !== undefined
  ) {
    if (typeof payload.completed !== "boolean") {
      details.push({ field: "completed", issue: "must be a boolean" });
    }
  }

  return details;
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
  buildContactKey,
  validateRegistrationPayload,
  validateLoginPayload,
  validateVerificationPayload,
  validateTaskPayload
};
