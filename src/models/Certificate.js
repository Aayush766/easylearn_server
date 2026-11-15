import mongoose from "mongoose";
const certificateSchema = new mongoose.Schema({
  certificateNumber: { type: String, required: true, unique: true, index: true }, learnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true }, enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", required: true, index: true },
  assessmentAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: "Attempt" }, issueDate: { type: Date, default: Date.now }, score: Number, certificateUrl: String,
  certificateTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "CertificateTemplate" }, templateSnapshot: { type: mongoose.Schema.Types.Mixed },
  verificationCode: { type: String, required: true, unique: true, index: true }, status: { type: String, enum: ["VALID", "REVOKED"], default: "VALID", index: true }, deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });
certificateSchema.index({ enrollmentId: 1, courseId: 1 });
export default mongoose.model("Certificate", certificateSchema);
