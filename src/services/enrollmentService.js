import Enrollment from "../models/Enrollment.js";
import AppError from "../utils/AppError.js";

export function enrollmentStatus(enrollment, now = new Date()) { if (enrollment.status === "SUSPENDED") return "SUSPENDED"; if (now < enrollment.startDate) return "UPCOMING"; if (now >= enrollment.expiryDate) return "EXPIRED"; return enrollment.status === "COMPLETED" ? "COMPLETED" : "ACTIVE"; }
export async function checkEnrollmentAccess({ learnerId, courseId }) {
  const enrollment = await Enrollment.findOne({ learnerId, courseId, deletedAt: null, status: { $in: ["ACTIVE", "UPCOMING", "COMPLETED"] } }).sort({ expiryDate: -1 });
  if (!enrollment) throw new AppError("An active enrollment was not found.", { code: "ENROLLMENT_NOT_FOUND", statusCode: 403 });
  const status = enrollmentStatus(enrollment);
  if (status === "EXPIRED") { await Enrollment.findByIdAndUpdate(enrollment.id, { status }); throw new AppError("Course access has expired.", { code: "COURSE_EXPIRED", statusCode: 403 }); }
  if (status !== "ACTIVE" && status !== "COMPLETED") throw new AppError("Course access is not available yet.", { code: "ENROLLMENT_INACTIVE", statusCode: 403 });
  return enrollment;
}
export async function expireEnrollments() { const now = new Date(); const result = await Enrollment.updateMany({ deletedAt: null, status: { $in: ["ACTIVE", "UPCOMING"] }, expiryDate: { $lte: now } }, { status: "EXPIRED" }); return result.modifiedCount; }
