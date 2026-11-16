export const SIGNAL_URL =
  process.env.NEXT_PUBLIC_SIGNAL_URL ?? "http://localhost:8001";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);
export const EMOJIS = ["👍", "😂", "❤️", "👏", "🎉", "🙏"];

export const getApiError = (error: unknown) => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error.response;
    if (typeof response === "object" && response !== null && "data" in response) {
      const data = response.data;
      if (
        typeof data === "object" &&
        data !== null &&
        "message" in data &&
        typeof data.message === "string"
      ) {
        return data.message;
      }
    }
  }

  if (error instanceof Error) return error.message;
  return "The meeting request could not be completed.";
};

export const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};
