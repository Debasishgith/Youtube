import assert from "node:assert/strict";
import test from "node:test";
import {
  CommentTranslationError,
  isCommentTranslationRateLimited,
  isSupportedTranslationLanguage,
  translateCommentText,
} from "../services/commentTranslation.js";

test("supports only the language choices exposed in the comments UI", () => {
  assert.equal(isSupportedTranslationLanguage("hi"), true);
  assert.equal(isSupportedTranslationLanguage("xx"), false);
});

test("requires a server-side Google Translation API key", async () => {
  await assert.rejects(
    translateCommentText("Hello", "es", { apiKey: "" }),
    (error) => error instanceof CommentTranslationError && error.statusCode === 503,
  );
});

test("translates text through Google Cloud Translation and returns detected language", async () => {
  let requestUrl;
  let requestOptions;
  const result = await translateCommentText("Hello", "es", {
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return {
        ok: true,
        json: async () => ({
          data: {
            translations: [
              { translatedText: "Hola", detectedSourceLanguage: "en" },
            ],
          },
        }),
      };
    },
  });

  assert.match(requestUrl, /translation\.googleapis\.com\/language\/translate\/v2/);
  assert.match(requestUrl, /key=test-key/);
  assert.deepEqual(JSON.parse(requestOptions.body), {
    q: "Hello",
    target: "es",
    format: "text",
  });
  assert.deepEqual(result, {
    translatedText: "Hola",
    detectedSourceLanguage: "en",
  });
});

test("does not expose provider response details when Google rejects a request", async () => {
  await assert.rejects(
    translateCommentText("Hello", "es", {
      apiKey: "test-key",
      fetchImpl: async () => ({ ok: false, status: 403 }),
    }),
    (error) =>
      error instanceof CommentTranslationError &&
      error.statusCode === 502 &&
      !error.message.includes("test-key"),
  );
});

test("rate limits a client after 30 translations in one minute", () => {
  const clientKey = `translation-test-${Date.now()}`;
  const startedAt = Date.now();
  for (let request = 0; request < 30; request += 1) {
    assert.equal(isCommentTranslationRateLimited(clientKey, startedAt + request), false);
  }
  assert.equal(isCommentTranslationRateLimited(clientKey, startedAt + 31), true);
  assert.equal(
    isCommentTranslationRateLimited(clientKey, startedAt + 60_000),
    false,
  );
});
