import dotenv from "dotenv";
import mongoose from "mongoose";
import Meeting from "../models/Meeting.js";

dotenv.config();

const indexName = "meetingId_1";

try {
  if (!process.env.DB_URL) {
    throw new Error("DB_URL is not configured.");
  }

  await mongoose.connect(process.env.DB_URL);
  const indexes = await Meeting.collection.indexes();
  const staleIndex = indexes.find((index) => index.name === indexName);

  if (!staleIndex) {
    console.log(`The ${indexName} index is already absent.`);
  } else if (
    staleIndex.unique !== true ||
    staleIndex.key?.meetingId !== 1 ||
    Object.keys(staleIndex.key).length !== 1
  ) {
    throw new Error(`The ${indexName} index does not match the expected definition.`);
  } else {
    await Meeting.collection.dropIndex(indexName);
    console.log(`Removed obsolete ${indexName} index.`);
  }
} catch (error) {
  console.error(
    "Unable to remove the obsolete meeting index:",
    error instanceof Error ? error.message : "Unknown database error.",
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
