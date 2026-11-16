import axios from "axios";
import type { SecurityMetadata } from "./securityTypes";

export const formatSecurityDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));

export const describeDevice = (metadata?: SecurityMetadata) => {
  if (!metadata) return "Device information unavailable";

  const browser = [metadata.browser, metadata.browserVersion]
    .filter(Boolean)
    .join(" ");
  const operatingSystem = [metadata.os, metadata.osVersion]
    .filter(Boolean)
    .join(" ");
  const device = [metadata.deviceType, metadata.deviceModel]
    .filter(Boolean)
    .join(" · ");

  return [browser || "Unknown browser", operatingSystem || "Unknown operating system", device]
    .filter(Boolean)
    .join(" · ");
};

export const describeLocation = (metadata?: SecurityMetadata) =>
  [metadata?.city, metadata?.state, metadata?.country]
    .filter(Boolean)
    .join(", ") || "Location unavailable";

export const getSecurityErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};
