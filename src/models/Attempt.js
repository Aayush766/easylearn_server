import mongoose from "mongoose";
const answerSchema = new mongoose.Schema({ questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true }, selectedOptionKey: { type: String, trim: true }, selectedOptionKeys: [{ type: String, trim: true }], textResponse: { type: String, trim: true, maxlength: 5000 }, markedForReview: { type: Boolean, default: false }, savedAt: Date }, { _id: false });
const attemptSchema = new mongoose.Schema({
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assessment", required: true, index: true }, learnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, index: true },
  answers: [answerSchema], status: { type: String, enum: ["IN_PROGRESS", "SUBMITTED", "TIMED_OUT"], default: "IN_PROGRESS", index: true },
  score: Number, totalMarks: Number, percentage: Number, result: { type: String, enum: ["PASS", "FAIL"] }, correctCount: Number, incorrectCount: Number, pendingReviewCount: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now }, submittedAt: Date, timeTakenSeconds: Number,
}, { timestamps: true, versionKey: false });
attemptSchema.index({ learnerId: 1, assessmentId: 1, enrollmentId: 1, createdAt: -1 });
export default mongoose.model("Attempt", attemptSchema);
