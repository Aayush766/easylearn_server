import mongoose from "mongoose";
import Attendance, { ATTENDANCE_STATUSES } from "../models/Attendance.js";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { audit } from "../services/auditService.js";
import { assertObjectId, ok, parsePagination } from "../utils/api.js";

function getDateRange(value) {
  const dateString = value || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) throw new AppError("Use a valid attendance date.", { code: "VALIDATION_ERROR", statusCode: 400 });
  const start = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== dateString) throw new AppError("Use a valid attendance date.", { code: "VALIDATION_ERROR", statusCode: 400 });
  return { dateString, start, end: new Date(start.getTime() + 86_400_000) };
}

function validateSessionName(value) {
  const sessionName = String(value || "").trim();
  if (sessionName.length > 120) throw new AppError("Session name must be 120 characters or fewer.", { code: "VALIDATION_ERROR", statusCode: 400 });
  return sessionName;
}

export async function getRoster(req, res, next) {
  try {
    assertObjectId(req.query.courseId, "Course");
    const course = await Course.findOne({ _id: req.query.courseId, deletedAt: null }).populate("trainerIds", "name email");
    if (!course) throw new AppError("Course was not found.", { code: "COURSE_NOT_FOUND", statusCode: 404 });
    if (req.user.role === "TRAINER" && !course.trainerIds.some((trainer) => String(trainer._id) === String(req.user._id))) throw new AppError("You can only take attendance for courses assigned to you.", { code: "TRAINER_NOT_ASSIGNED", statusCode: 403 });
    const { start, end, dateString } = getDateRange(req.query.date);
    const sessionName = validateSessionName(req.query.sessionName);
    const enrollments = await Enrollment.find({ courseId: course._id, deletedAt: null, status: { $nin: ["SUSPENDED"] }, startDate: { $lt: end }, expiryDate: { $gt: start } }).populate({ path: "learnerId", match: { role: "LEARNER", status: "ACTIVE", deletedAt: null }, select: "name email profileImage" }).sort({ createdAt: 1 });
    const learners = [...new Map(enrollments.filter((enrollment) => enrollment.learnerId).map((enrollment) => [String(enrollment.learnerId._id), enrollment.learnerId])).values()];
    const marks = await Attendance.find({ courseId: course._id, learnerId: { $in: learners.map((learner) => learner._id) }, attendanceDate: start, sessionName }).lean();
    const byLearner = new Map(marks.map((mark) => [String(mark.learnerId), mark]));
    ok(res, "Attendance roster fetched successfully.", { course: { _id: course._id, title: course.title, trainers: course.trainerIds }, date: dateString, sessionName, learners: learners.map((learner) => ({ learner, attendance: byLearner.get(String(learner._id)) || null })) });
  } catch (error) { next(error); }
}

export async function saveSession(req, res, next) {
  try {
    assertObjectId(req.body?.courseId, "Course");
    if (!Array.isArray(req.body.records) || req.body.records.length < 1 || req.body.records.length > 500) throw new AppError("Choose between 1 and 500 learners to save attendance.", { code: "VALIDATION_ERROR", statusCode: 400 });
    const course = await Course.findOne({ _id: req.body.courseId, trainerIds: req.user._id, deletedAt: null });
    if (!course) throw new AppError("You can only take attendance for courses assigned to you.", { code: "TRAINER_NOT_ASSIGNED", statusCode: 403 });
    const { start, end } = getDateRange(req.body.date);
    if (start.getTime() > Date.now() + 86_400_000) throw new AppError("Attendance cannot be recorded for a future date.", { code: "VALIDATION_ERROR", statusCode: 400 });
    const sessionName = validateSessionName(req.body.sessionName);
    const ids = req.body.records.map((record) => String(record.learnerId || ""));
    if (ids.some((id) => !/^[a-f\d]{24}$/i.test(id)) || new Set(ids).size !== ids.length) throw new AppError("Learner selection is invalid or contains duplicates.", { code: "VALIDATION_ERROR", statusCode: 400 });
    if (req.body.records.some((record) => !ATTENDANCE_STATUSES.includes(record.status))) throw new AppError("Choose a valid attendance status for every learner.", { code: "VALIDATION_ERROR", statusCode: 400 });
    const [enrollments, activeLearners] = await Promise.all([Enrollment.find({ courseId: course._id, learnerId: { $in: ids }, deletedAt: null, status: { $nin: ["SUSPENDED"] }, startDate: { $lt: end }, expiryDate: { $gt: start } }).distinct("learnerId"), User.countDocuments({ _id: { $in: ids }, role: "LEARNER", status: "ACTIVE", deletedAt: null })]);
    const enrolled = new Set(enrollments.map(String));
    if (activeLearners !== ids.length || ids.some((id) => !enrolled.has(id))) throw new AppError("Attendance can only be marked for active learners enrolled in this course on the selected date.", { code: "LEARNER_NOT_ENROLLED", statusCode: 403 });
    const operations = req.body.records.map((record) => ({ updateOne: { filter: { courseId: course._id, learnerId: record.learnerId, attendanceDate: start, sessionName }, update: { $set: { status: record.status, note: String(record.note || "").trim().slice(0, 500), trainerId: req.user._id, markedBy: req.user._id }, $setOnInsert: { courseId: course._id, learnerId: record.learnerId, attendanceDate: start, sessionName } }, upsert: true } }));
    await Attendance.bulkWrite(operations, { ordered: true });
    await audit(req.user._id, "ATTENDANCE_SESSION_SAVED", "Attendance", course._id, { courseId: String(course._id), courseTitle: course.title, attendanceDate: start.toISOString(), sessionName, learnerCount: ids.length });
    const saved = await Attendance.find({ courseId: course._id, learnerId: { $in: ids }, attendanceDate: start, sessionName }).populate("learnerId", "name email").populate("trainerId", "name email").sort({ "learnerId.name": 1 });
    ok(res, "Attendance saved successfully.", { items: saved, date: start.toISOString().slice(0, 10), sessionName });
  } catch (error) { next(error); }
}

export async function listAttendance(req, res, next) {
  try {
    const filter = {};
    if (req.user.role === "LEARNER") filter.learnerId = req.user._id;
    if (req.user.role === "TRAINER") filter.trainerId = req.user._id;
    if (req.query.courseId) { assertObjectId(req.query.courseId, "Course"); filter.courseId = new mongoose.Types.ObjectId(req.query.courseId); }
    if (req.query.learnerId && req.user.role !== "LEARNER") { assertObjectId(req.query.learnerId, "Learner"); filter.learnerId = new mongoose.Types.ObjectId(req.query.learnerId); }
    if (req.query.trainerId && ["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) { assertObjectId(req.query.trainerId, "Trainer"); filter.trainerId = new mongoose.Types.ObjectId(req.query.trainerId); }
    if (req.query.status && ATTENDANCE_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.date) { const { start } = getDateRange(req.query.date); filter.attendanceDate = start; }
    if (req.query.from || req.query.to) { const range = {}; if (req.query.from) range.$gte = getDateRange(req.query.from).start; if (req.query.to) range.$lt = getDateRange(req.query.to).end; filter.attendanceDate = range; }
    if (req.query.sessionName !== undefined) filter.sessionName = validateSessionName(req.query.sessionName);
    if (req.user.role === "TRAINER" && req.query.courseId && !await Course.exists({ _id: req.query.courseId, trainerIds: req.user._id, deletedAt: null })) throw new AppError("You can only view attendance for your assigned courses.", { code: "TRAINER_NOT_ASSIGNED", statusCode: 403 });
    if (req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN") {
      if (req.query.learnerId && !await User.exists({ _id: req.query.learnerId, role: "LEARNER", deletedAt: null })) throw new AppError("Learner was not found.", { code: "NOT_FOUND", statusCode: 404 });
      if (req.query.trainerId && !await User.exists({ _id: req.query.trainerId, role: "TRAINER", deletedAt: null })) throw new AppError("Trainer was not found.", { code: "NOT_FOUND", statusCode: 404 });
    }
    const { page, limit } = parsePagination(req.query);
    const [items, total, totals] = await Promise.all([
      Attendance.find(filter).populate("learnerId", "name email profileImage").populate("courseId", "title").populate("trainerId", "name email").sort({ attendanceDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Attendance.countDocuments(filter),
      Attendance.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);
    ok(res, "Attendance records fetched successfully.", { items, page, limit, total, totalPages: Math.ceil(total / limit), summary: Object.fromEntries(totals.map(({ _id, count }) => [_id, count])) });
  } catch (error) { next(error); }
}
