import { timingSafeEqual } from "crypto";
import { hashToken } from "./loginSecurity.js";

export const isValidRoomId = (roomId) =>
  typeof roomId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(roomId);

export const tokenMatches = (token, tokenHash) => {
  if (typeof token !== "string" || !token || !tokenHash) return false;

  const candidate = Buffer.from(hashToken(token));
  const expected = Buffer.from(tokenHash);
  return (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
};
