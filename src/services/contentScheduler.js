import Content from "../models/Content.js";

export async function publishDueContent(now = new Date()) {
  const result = await Content.updateMany(
    { status: "SCHEDULED", scheduledFor: { $lte: now } },
    { $set: { status: "PUBLISHED" }, $unset: { scheduledFor: 1 } },
  );
  return result.modifiedCount;
}
