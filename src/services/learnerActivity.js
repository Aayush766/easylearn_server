import LearnerActivity from "../models/LearnerActivity.js";

export function activityDayKey(date = new Date()) { return new Date(date).toISOString().slice(0, 10); }

export async function recordLearnerActivity(learnerId, completedLessons = 0) {
  const day = activityDayKey();
  try {
    await LearnerActivity.updateOne({ learnerId, day }, { $setOnInsert: { learnerId, day }, ...(completedLessons ? { $inc: { completedLessons } } : {}) }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    if (completedLessons) await LearnerActivity.updateOne({ learnerId, day }, { $inc: { completedLessons } });
  }
}
