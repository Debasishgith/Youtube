import { isIP } from "node:net";
import profanityFilter from "leo-profanity";

profanityFilter.loadDictionary("en");
profanityFilter.add(profanityFilter.getDictionary("fr"));
profanityFilter.add(profanityFilter.getDictionary("ru"));

const MAX_COMMENT_LENGTH = 2000;
const MAX_LINKS = 2;
const SHORTENER_DOMAINS = new Set([
  "bit.ly",
  "goo.gl",
  "ow.ly",
  "t.co",
  "tinyurl.com",
]);

const normalizeForChecks = (text) =>
  text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .toLowerCase();

const findSuspiciousLink = (text) => {
  if (/\b(?:javascript|data|vbscript|file):/iu.test(text) || /<\s*a\b/iu.test(text)) {
    return "This comment contains a blocked or suspicious link.";
  }
  const links = text.match(/(?:https?:\/\/|www\.)[^\s<>]+/giu) ?? [];
  if (links.length > MAX_LINKS) return "Too many links in one comment.";
  const configuredBlockedDomains = (process.env.COMMENT_BLOCKED_DOMAINS || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  for (const rawLink of links) {
    let url;
    try {
      url = new URL(rawLink.startsWith("www.") ? `https://${rawLink}` : rawLink);
    } catch {
      return "A link in this comment is invalid.";
    }

    const hostname = url.hostname.toLowerCase();
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.split(".").some((label) => label.startsWith("xn--")) ||
      isIP(hostname) ||
      SHORTENER_DOMAINS.has(hostname) ||
      configuredBlockedDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
    ) {
      return "This comment contains a blocked or suspicious link.";
    }
  }
  return null;
};

const hasSymbolFlood = (text) => {
  const visible = [...text].filter((character) => !/\s/u.test(character));
  if (visible.length < 16) return false;
  const lettersAndNumbers = visible.filter((character) =>
    /[\p{L}\p{N}]/u.test(character),
  ).length;
  return (visible.length - lettersAndNumbers) / visible.length > 0.7;
};

const hasRepeatedContent = (text) =>
  /(.)\1{11,}/su.test(text) ||
  /(?:^|\s)(.{2,40})(?:\s+\1){3,}(?:\s|$)/iu.test(text) ||
  (text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0) > 12;

export const validateCommentBody = (input) => {
  if (typeof input !== "string") {
    return { error: "Comment text is required." };
  }
  const body = input.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/gu, "").trim();
  if (!body) return { error: "Comment text is required." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { error: `Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.` };
  }

  const normalized = normalizeForChecks(body);
  if (profanityFilter.check(normalized)) {
    return { error: "This comment contains language that is not allowed." };
  }
  const linkError = findSuspiciousLink(body);
  if (linkError) return { error: linkError };
  if (hasSymbolFlood(normalized) || hasRepeatedContent(normalized)) {
    return { error: "This comment looks like repeated or automated content." };
  }

  const configuredBlockedWords = (process.env.COMMENT_BLOCKED_WORDS || "")
    .split(",")
    .map((word) => word.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (
    configuredBlockedWords.some((word) =>
      new RegExp(
        `(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`,
        "iu",
      ).test(normalized),
    )
  ) {
    return { error: "This comment contains language that is not allowed." };
  }

  return { body };
};

export const verifyRecaptchaToken = async (token) => {
  const secret = process.env.COMMENT_RECAPTCHA_SECRET_KEY?.trim();
  if (!secret) {
    return {
      configured: false,
      success: false,
    };
  }
  if (typeof token !== "string" || !token.trim()) {
    return { configured: true, success: false };
  }

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  if (!response.ok) {
    throw new Error(`reCAPTCHA verification failed with HTTP ${response.status}.`);
  }
  const result = await response.json();
  return { configured: true, success: result.success === true };
};

export const COMMENT_CAPTCHA_THRESHOLD = 3;
export const COMMENT_CAPTCHA_WINDOW_MS = 10 * 60 * 1000;
export const COMMENT_HARD_RATE_LIMIT = 10;
