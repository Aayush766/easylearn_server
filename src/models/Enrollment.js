import mongoose from "mongoose";
export const ENROLLMENT_STATUSES = ["UPCOMING", "ACTIVE", "EXPIRED", "SUSPENDED", "COMPLETED"];
const enrollmentSchema = new mongoose.Schema({
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  startDate: { type: Date, required: true, index: true },
  expiryDate: { type: Date, required: true, index: true },
  validityDays: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ENROLLMENT_STATUSES, default: "UPCOMING", index: true },
  source: { type: String, enum: ["ADMIN", "IMPORT", "SELF_SERVICE"], default: "ADMIN" },
  previousEnrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment" },
  renewedAt: Date,
  renewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });
enrollmentSchema.index({ learnerId: 1, courseId: 1, createdAt: -1 });
export default mongoose.model("Enrollment", enrollmentSchema);
