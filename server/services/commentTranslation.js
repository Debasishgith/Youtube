const SUPPORTED_LANGUAGES = new Set([
  "en",
  "es",
  "fr",
  "de",
  "hi",
  "it",
  "ja",
  "pt",
  "ru",
]);
const GOOGLE_TRANSLATE_URL =
  "https://translation.googleapis.com/language/translate/v2";
const TRANSLATION_TIMEOUT_MS = 10000;
const TRANSLATION_RATE_LIMIT = 30;
const TRANSLATION_RATE_WINDOW_MS = 60 * 1000;
const MAX_TRACKED_TRANSLATION_CLIENTS = 5000;
const translationRequests = new Map();
let lastRateLimitCleanup = 0;

export class CommentTranslationError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "CommentTranslationError";
    this.statusCode = statusCode;
  }
}

export const isSupportedTranslationLanguage = (language) =>
  typeof language === "string" && SUPPORTED_LANGUAGES.has(language);

export const isCommentTranslationRateLimited = (clientKey, now = Date.now()) => {
  if (now - lastRateLimitCleanup >= TRANSLATION_RATE_WINDOW_MS) {
    for (const [key, requestWindow] of translationRequests) {
      if (now - requestWindow.startedAt >= TRANSLATION_RATE_WINDOW_MS) {
        translationRequests.delete(key);
      }
    }
    lastRateLimitCleanup = now;
  }

  const current = translationRequests.get(clientKey);
  if (!current || now - current.startedAt >= TRANSLATION_RATE_WINDOW_MS) {
    if (!current && translationRequests.size >= MAX_TRACKED_TRANSLATION_CLIENTS) {
      return true;
    }
    translationRequests.set(clientKey, { startedAt: now, count: 1 });
    return false;
  }
  if (current.count >= TRANSLATION_RATE_LIMIT) return true;
  current.count += 1;
  return false;
};

export const translateCommentText = async (
  text,
  targetLanguage,
  { apiKey = process.env.GOOGLE_TRANSLATE_API_KEY, fetchImpl = fetch } = {},
) => {
  if (!apiKey?.trim()) {
    throw new CommentTranslationError(
      "Google Cloud Translation is not configured on the server.",
      503,
    );
  }
  if (!isSupportedTranslationLanguage(targetLanguage)) {
    throw new CommentTranslationError("The target language is not supported.", 400);
  }

  let response;
  try {
    response = await fetchImpl(
      `${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, target: targetLanguage, format: "text" }),
        signal: AbortSignal.timeout(TRANSLATION_TIMEOUT_MS),
      },
    );
  } catch {
    throw new CommentTranslationError(
      "Google Cloud Translation could not be reached. Try again shortly.",
      502,
    );
  }

  if (!response.ok) {
    throw new CommentTranslationError(
      "Google Cloud Translation could not translate this comment.",
      response.status === 429 ? 503 : 502,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new CommentTranslationError(
      "Google Cloud Translation returned an invalid response.",
      502,
    );
  }

  const translatedText = payload?.data?.translations?.[0]?.translatedText;
  if (typeof translatedText !== "string") {
    throw new CommentTranslationError(
      "Google Cloud Translation returned no translated text.",
      502,
    );
  }

  return {
    translatedText,
    detectedSourceLanguage:
      payload.data.translations[0].detectedSourceLanguage || null,
  };
};
