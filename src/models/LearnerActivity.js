import mongoose from "mongoose";

const learnerActivitySchema = new mongoose.Schema({
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  day: { type: String, required: true },
  completedLessons: { type: Number, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });

learnerActivitySchema.index({ learnerId: 1, day: 1 }, { unique: true });

export default mongoose.model("LearnerActivity", learnerActivitySchema);
