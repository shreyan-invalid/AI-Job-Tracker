import { detectSectionKey } from "@/lib/resumeParser/detectSections";

export type ExtractedEntities = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)\d{3}[\s-]?\d{4}/;

function looksLikeName(line: string): boolean {
  if (line.length < 2 || line.length > 70) {
    return false;
  }

  if (/\d|@|https?:\/\//i.test(line)) {
    return false;
  }

  if (detectSectionKey(line)) {
    return false;
  }

  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 5;
}

function normalizeName(line: string): string {
  return line
    .replace(/[^A-Za-z.'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferName(lines: string[], email: string | null): string | null {
  for (const line of lines.slice(0, 10)) {
    if (looksLikeName(line)) {
      return normalizeName(line);
    }
  }

  if (email) {
    const emailLineIndex = lines.findIndex((line) => line.toLowerCase().includes(email.toLowerCase()));

    if (emailLineIndex > 0) {
      for (let index = emailLineIndex - 1; index >= 0; index -= 1) {
        if (looksLikeName(lines[index])) {
          return normalizeName(lines[index]);
        }
      }
    }
  }

  return null;
}

function inferNameFromEmailContext(text: string, email: string | null): string | null {
  if (!email) {
    return null;
  }

  const emailIndex = text.toLowerCase().indexOf(email.toLowerCase());

  if (emailIndex <= 0) {
    return null;
  }

  const prefixWindow = text.slice(Math.max(0, emailIndex - 80), emailIndex);
  const cleaned = prefixWindow
    .replace(/[^A-Za-z.'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  const words = cleaned.split(" ").filter(Boolean);

  if (words.length < 2) {
    return null;
  }

  const candidate = words.slice(-3).join(" ");

  if (looksLikeName(candidate)) {
    return normalizeName(candidate);
  }

  const fallback = words.slice(-2).join(" ");
  return looksLikeName(fallback) ? normalizeName(fallback) : null;
}

export function extractEntities(text: string): ExtractedEntities {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const emailMatch = text.match(EMAIL_REGEX);
  const phoneMatch = text.match(PHONE_REGEX);

  const email = emailMatch ? emailMatch[0].toLowerCase() : null;
  const phone = phoneMatch ? phoneMatch[0] : null;

  const inferredName = inferName(lines, email) ?? inferNameFromEmailContext(text, email);

  return {
    name: inferredName,
    email,
    phone
  };
}
