import assert from "node:assert/strict";
import test from "node:test";
import { validateCommentBody, verifyRecaptchaToken } from "../services/commentModeration.js";

test("accepts multilingual comments and normalizes invisible formatting characters", () => {
  const result = validateCommentBody("  Hello, नमस्ते, привет! \u200B  ");
  assert.equal(result.body, "Hello, नमस्ते, привет!");
});

test("rejects repeated characters, emoji floods, and executable links", () => {
  assert.match(validateCommentBody("a".repeat(14)).error, /repeated or automated/);
  assert.match(validateCommentBody("😀".repeat(13)).error, /repeated or automated/);
  assert.match(validateCommentBody("javascript:alert(1)").error, /suspicious link/);
});

test("rejects blocked domains and shorteners but allows ordinary HTTPS links", () => {
  const originalBlockedDomains = process.env.COMMENT_BLOCKED_DOMAINS;
  process.env.COMMENT_BLOCKED_DOMAINS = "unsafe.example";
  try {
    assert.match(
      validateCommentBody("Visit https://unsafe.example/path").error,
      /suspicious link/,
    );
    assert.match(
      validateCommentBody("Visit https://bit.ly/example").error,
      /suspicious link/,
    );
    assert.equal(
      validateCommentBody("Visit https://example.com/help").body,
      "Visit https://example.com/help",
    );
  } finally {
    if (originalBlockedDomains === undefined) delete process.env.COMMENT_BLOCKED_DOMAINS;
    else process.env.COMMENT_BLOCKED_DOMAINS = originalBlockedDomains;
  }
});

test("supports additional configured blocked words", () => {
  const originalBlockedWords = process.env.COMMENT_BLOCKED_WORDS;
  process.env.COMMENT_BLOCKED_WORDS = "blockedterm";
  try {
    assert.match(validateCommentBody("This is a blockedterm.").error, /not allowed/);
    assert.equal(validateCommentBody("This is allowed.").body, "This is allowed.");
  } finally {
    if (originalBlockedWords === undefined) delete process.env.COMMENT_BLOCKED_WORDS;
    else process.env.COMMENT_BLOCKED_WORDS = originalBlockedWords;
  }
});

test("reports missing Google reCAPTCHA configuration without accepting a token", async () => {
  const originalSecret = process.env.COMMENT_RECAPTCHA_SECRET_KEY;
  delete process.env.COMMENT_RECAPTCHA_SECRET_KEY;
  try {
    assert.deepEqual(await verifyRecaptchaToken("token"), {
      configured: false,
      success: false,
    });
  } finally {
    if (originalSecret === undefined) delete process.env.COMMENT_RECAPTCHA_SECRET_KEY;
    else process.env.COMMENT_RECAPTCHA_SECRET_KEY = originalSecret;
  }
});
