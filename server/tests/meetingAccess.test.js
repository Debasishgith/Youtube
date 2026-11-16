import assert from "node:assert/strict";
import test from "node:test";
import { tokenMatches, isValidRoomId } from "../services/meetingAccess.js";
import { hashToken } from "../services/loginSecurity.js";

test("validates room IDs used by meeting routes and sockets", () => {
  assert.equal(isValidRoomId("room_1234"), true);
  assert.equal(isValidRoomId("short"), false);
  assert.equal(isValidRoomId("../room_1234"), false);
});

test("matches participant tokens without accepting a different token", () => {
  const token = "participant-token";
  const tokenHash = hashToken(token);

  assert.equal(tokenMatches(token, tokenHash), true);
  assert.equal(tokenMatches("another-token", tokenHash), false);
  assert.equal(tokenMatches("", tokenHash), false);
});
