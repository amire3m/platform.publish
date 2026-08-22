/**
 * Normalization helpers for workflow sheet import
 */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ASCII_DIGITS = "0123456789";

function convertDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx !== -1) {
      out += ASCII_DIGITS[pIdx];
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx !== -1) {
      out += ASCII_DIGITS[aIdx];
      continue;
    }
    out += ch;
  }
  return out;
}

export function normalizeWorkflowTitle(input: string): string {
  if (!input) return "";
  // NFC normalization, convert digits, trim and collapse spaces, zero-width removal
  let s = input.normalize("NFC");
  s = convertDigits(s);
  // remove zero-width non-joiner etc? keep simple: replace \u200c and \u200f
  s = s.replace(/[\u200c\u200f\uFEFF]/g, "");
  s = s.trim();
  s = s.replace(/\s+/g, " ");
  return s;
}

export function normalizeDeliverableName(input: string): string {
  return normalizeWorkflowTitle(input);
}

// Platform detection suffix
const PLATFORM_KEYWORDS: Record<string, "telegram" | "youtube" | "instagram"> = {
  "تلگرام": "telegram",
  telegram: "telegram",
  "یوتیوب": "youtube",
  youtube: "youtube",
  "اینستاگرام": "instagram",
  instagram: "instagram",
};

export function parseHeaderForPlatform(header: string): {
  base: string;
  normalizedBase: string;
  platform: "telegram" | "youtube" | "instagram" | null;
  original: string;
} {
  const original = header ?? "";
  const trimmed = original.trim().normalize("NFC");
  // Check for " در " separator
  // Find last occurrence of " در "
  const delimiter = " در ";
  let base = trimmed;
  let platform: "telegram" | "youtube" | "instagram" | null = null;

  // Try to split by delimiter
  const lastDelimIndex = trimmed.lastIndexOf(delimiter);
  if (lastDelimIndex !== -1) {
    const candidateBase = trimmed.slice(0, lastDelimIndex).trim();
    const candidatePlatformRaw = trimmed.slice(lastDelimIndex + delimiter.length).trim();
    const lowered = candidatePlatformRaw.toLowerCase();
    // normalize platform keyword (remove extra spaces, digits?)
    const mapped = PLATFORM_KEYWORDS[lowered] ?? PLATFORM_KEYWORDS[candidatePlatformRaw];
    if (mapped) {
      base = candidateBase;
      platform = mapped;
    } else {
      // also try case where platform string includes extra: e.g., "تلگرام " with spaces already trimmed
      // search keyword inside
      for (const [key, val] of Object.entries(PLATFORM_KEYWORDS)) {
        if (lowered.includes(key)) {
          base = candidateBase;
          platform = val;
          break;
        }
      }
    }
  } else {
    // No delimiter, maybe header is exactly platform? then base is whole?
    // check if header itself equals platform keyword (standalone)
    const lowered = trimmed.toLowerCase();
    if (PLATFORM_KEYWORDS[lowered]) {
      // This is ambiguous: deliverable platform without base – treat as unknown?
      platform = PLATFORM_KEYWORDS[lowered];
      base = "";
    }
  }

  // If base empty after extraction, fallback to trimmed
  if (!base) base = trimmed;

  const normalizedBase = normalizeDeliverableName(base);
  return { base, normalizedBase, platform, original };
}

export function isTitleHeader(header: string): boolean {
  const normalized = header.trim().toLowerCase().normalize("NFC");
  // includes Persian title indicators
  return (
    normalized.includes("نام") ||
    normalized.includes("عنوان") ||
    normalized.includes("برنامه") ||
    normalized.includes("title")
  );
}
