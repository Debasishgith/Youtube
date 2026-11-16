import mongoose from "mongoose";

export const loginMetadataSchema = new mongoose.Schema(
  {
    ipAddress: { type: String, default: null },
    browser: { type: String, default: "Unknown" },
    browserVersion: { type: String, default: null },
    os: { type: String, default: "Unknown" },
    osVersion: { type: String, default: null },
    deviceType: {
      type: String,
      enum: ["Desktop", "Mobile", "Tablet"],
      default: "Desktop",
    },
    deviceModel: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    country: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  { _id: false },
);
