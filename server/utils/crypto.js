const crypto = require("crypto");

const env = require("../../config/env");

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function encryptValue(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", env.ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}.${authTag.toString("hex")}.${encrypted.toString("hex")}`;
}

function decryptValue(payload) {
  const [ivHex, authTagHex, encryptedHex] = String(payload).split(".");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    env.ENCRYPTION_KEY,
    Buffer.from(ivHex, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final()
  ]).toString("utf8");
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskContact(contactType, contact) {
  if (contactType === "phone") {
    const tail = contact.slice(-4);
    return `${"*".repeat(Math.max(0, contact.length - 4))}${tail}`;
  }

  const [name, domain] = contact.split("@");
  const visibleName = name.length <= 2 ? `${name[0] || "*"}*` : `${name.slice(0, 2)}***`;
  return `${visibleName}@${domain}`;
}

module.exports = {
  hashValue,
  encryptValue,
  decryptValue,
  generateVerificationCode,
  maskContact
};
