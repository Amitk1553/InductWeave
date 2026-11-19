// Input hygiene for anything that ends up inside an LLM prompt.

const INJECTION_PATTERNS = [
  [/ignore\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|prompts?|rules?|directions?)/i, 'ignore-previous-instructions'],
  [/disregard\s+(all\s+|any\s+|the\s+|your\s+)?(previous|prior|above|earlier)?\s*(instructions?|rules?|guidelines?)/i, 'disregard-instructions'],
  [/forget\s+(everything|all\s+(previous|prior|your)|your\s+(instructions?|rules?))/i, 'forget-instructions'],
  [/override\s+(your|the|all)\s+(rules?|instructions?|guidelines?|safety)/i, 'override-rules'],
  [/(reveal|show|print|repeat|output|display|leak)\s+(me\s+)?(your|the)\s+(system|hidden|initial|original)\s+(prompt|instructions?|message)/i, 'prompt-exfiltration'],
  [/system\s+prompt/i, 'system-prompt'],
  [/\byou\s+are\s+now\b/i, 'role-reassignment'],
  [/\bpretend\s+(to\s+be|you\s+are|that\s+you)/i, 'role-reassignment'],
  [/\bact\s+as\s+(an?\s+)?(unrestricted|jailbroken|dan|evil|different)/i, 'role-reassignment'],
  [/\b(developer|debug|god|admin)\s+mode\b/i, 'privileged-mode'],
  [/\bjailbreak/i, 'jailbreak'],
  [/\bnew\s+instructions?\s*:/i, 'new-instructions'],
];

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g;
const CODE_FENCES = /`{3,}[a-zA-Z]*/g;
const XML_LIKE_TAGS = /<\/?[a-zA-Z][^>]{0,200}>/g;
const CHAT_TEMPLATE_TOKENS = /<\|[^|>]{1,40}\|>|\[\/?INST\]|<<\/?SYS>>/gi;
const ROLE_MARKERS = /^\s*(system|assistant|user|human|ai|model)\s*:\s*/gim;

/**
 * Cleans text for prompt use and reports suspected injection.
 * Returns the cleaned text even when flagged; callers decide whether to refuse.
 */
export function sanitizeText(input, { maxLength = 1000 } = {}) {
  const original = String(input ?? '');
  const reasons = [];

  for (const [pattern, reason] of INJECTION_PATTERNS) {
    if (pattern.test(original) && !reasons.includes(reason)) reasons.push(reason);
  }

  let text = original
    .normalize('NFKC')
    .replace(CONTROL_CHARS, ' ')
    .replace(CHAT_TEMPLATE_TOKENS, ' ')
    .replace(CODE_FENCES, ' ')
    .replace(XML_LIKE_TAGS, ' ')
    .replace(ROLE_MARKERS, '')
    .replace(/\s+/g, ' ')
    .trim();

  const truncated = text.length > maxLength;
  if (truncated) text = text.slice(0, maxLength);

  // Re-check after normalization so obfuscated variants (zero-width chars etc.) are caught too.
  for (const [pattern, reason] of INJECTION_PATTERNS) {
    if (pattern.test(text) && !reasons.includes(reason)) reasons.push(reason);
  }

  return { text, flagged: reasons.length > 0, reasons, truncated };
}

export const wrapUserData = (text) => `<user_data>${text}</user_data>`;

/**
 * Profile fields are free text (HR can type any role), so they are a prompt-injection vector.
 * Flagged fields are replaced with a neutral placeholder rather than sent to the model.
 */
export function sanitizeProfile({ role, department, location, startDate }) {
  const flags = [];
  const clean = (field, value) => {
    const r = sanitizeText(value, { maxLength: 80 });
    if (r.flagged) {
      flags.push({ field, reasons: r.reasons });
      return 'unspecified';
    }
    return r.text || 'unspecified';
  };
  return {
    profile: {
      role: clean('role', role),
      department: clean('department', department),
      location: clean('location', location),
      startDate,
    },
    flags,
  };
}
