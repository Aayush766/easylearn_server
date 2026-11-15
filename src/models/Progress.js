import mongoose from "mongoose";
const progressSchema = new mongoose.Schema({
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  contentId: { type: mongoose.Schema.Types.ObjectId, ref: "Content", required: true, index: true },
  completed: { type: Boolean, default: false }, progressPercent: { type: Number, default: 0, min: 0, max: 100 },
  watchedSeconds: { type: Number, default: 0, min: 0 }, lastPosition: { type: Number, default: 0, min: 0 }, completedAt: Date,
}, { timestamps: true, versionKey: false });
progressSchema.index({ learnerId: 1, enrollmentId: 1, contentId: 1 }, { unique: true });
export default mongoose.model("Progress", progressSchema);
