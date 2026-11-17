import mongoose from "mongoose";

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];
const attendanceSchema = new mongoose.Schema({
  learnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  trainerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  attendanceDate: { type: Date, required: true, index: true },
  sessionName: { type: String, trim: true, maxlength: 120, default: "" },
  status: { type: String, enum: ATTENDANCE_STATUSES, required: true, index: true },
  note: { type: String, trim: true, maxlength: 500, default: "" },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });
attendanceSchema.index({ learnerId: 1, courseId: 1, attendanceDate: 1, sessionName: 1 }, { unique: true });
export default mongoose.model("Attendance", attendanceSchema);
