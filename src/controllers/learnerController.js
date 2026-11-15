import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import Assessment from "../models/Assessment.js";
import Attempt from "../models/Attempt.js";
import { env } from "../config/env.js";
import Certificate from "../models/Certificate.js";
import Content from "../models/Content.js";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import LearnerActivity from "../models/LearnerActivity.js";
import { activityDayKey, recordLearnerActivity } from "../services/learnerActivity.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import Progress from "../models/Progress.js";
import SupportTicket from "../models/SupportTicket.js";
import User from "../models/User.js";
import { checkEnrollmentAccess } from "../services/enrollmentService.js";
import { publishDueContent } from "../services/contentScheduler.js";
import AppError from "../utils/AppError.js";
import { list, ok } from "../utils/api.js";

function cloudinaryPdfUrl(content) {
  const rawUrl = content.file?.url;
  if (!rawUrl || content.file?.provider !== "CLOUDINARY") return "";
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") return "";
    const cloudName = url.pathname.split("/").filter(Boolean)[0];
    if (env.cloudinary.cloudName && cloudName !== env.cloudinary.cloudName) return "";
    if (!url.pathname.includes("/raw/upload/")) return "";
    return url.toString();
  } catch { return ""; }
}

function cloudinarySignedPdfDownload(sourceUrl) {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) return null;
  const source = new URL(sourceUrl);
  const parts = source.pathname.split("/").filter(Boolean);
  const uploadIndex = parts.indexOf("upload");
  if (uploadIndex < 0) return null;
  const assetParts = parts.slice(uploadIndex + 1);
  if (assetParts[0]?.startsWith("v") && /^v\d+$/.test(assetParts[0])) assetParts.shift();
  const publicId = assetParts.join("/");
  if (!publicId.toLowerCase().endsWith(".pdf")) return null;
  const params = { format: "pdf", public_id: publicId, timestamp: Math.floor(Date.now() / 1000), type: "upload" };
  const signed = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
  const signature = createHash("sha1").update(`${signed}${apiSecret}`).digest("hex");
  const downloadUrl = new URL(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/raw/download`);
  for (const [key, value] of Object.entries({ ...params, api_key: apiKey, signature })) downloadUrl.searchParams.set(key, String(value));
  return downloadUrl.toString();
}

export async function streamPdfForLearner(req, res, next) {
  try {
    await publishDueContent();
    const content = await Content.findOne({ _id: req.params.id, type: "PDF", status: "PUBLISHED", deletedAt: null });
    if (!content) throw new AppError("PDF content was not found.", { code: "NOT_FOUND", statusCode: 404 });
    if (content.accessLevel === "FREE") {
      if (!await Course.exists({ _id: content.courseId, status: "PUBLISHED" })) throw new AppError("PDF content was not found.", { code: "NOT_FOUND", statusCode: 404 });
    } else await checkEnrollmentAccess({ learnerId: req.user._id, courseId: content.courseId });
    const sourceUrl = cloudinaryPdfUrl(content);
    if (!sourceUrl) throw new AppError("This PDF is not stored in a supported Cloudinary location. Ask your trainer to upload it again.", { code: "PDF_SOURCE_INVALID", statusCode: 422 });
    let upstream = await fetch(sourceUrl, { redirect: "error", signal: AbortSignal.timeout(30000) });
    if (upstream.status === 401 || upstream.status === 403) {
      const signedDownloadUrl = cloudinarySignedPdfDownload(sourceUrl);
      if (signedDownloadUrl) upstream = await fetch(signedDownloadUrl, { redirect: "error", signal: AbortSignal.timeout(30000) });
    }
    if (!upstream.ok) {
      const status = upstream.status;
      if (status === 401 || status === 403) throw new AppError("Cloudinary is denying PDF delivery. In Cloudinary Console, open Settings → Security and enable ‘Allow delivery of PDF and ZIP files’; then retry. If it is already enabled, check the asset’s delivery type and account access rules.", { code: "PDF_DELIVERY_BLOCKED", statusCode: 502 });
      throw new AppError(`Cloudinary could not provide this PDF (HTTP ${status}). Ask your trainer to re-upload it.`, { code: "PDF_UPSTREAM_ERROR", statusCode: 502 });
    }
    const contentType = upstream.headers.get("content-type") || "application/pdf";
    if (!contentType.toLowerCase().includes("pdf")) throw new AppError("The uploaded file is not being delivered as a PDF. Ask your trainer to re-upload it.", { code: "PDF_INVALID_TYPE", statusCode: 502 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${String(content.title || "course-material").replace(/[\r\n"\\]/g, "_")}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) { next(error); }
}

export async function myCourses(req, res, next) {
  try {
    await publishDueContent(new Date());
    const enrollments = await Enrollment.find({ learnerId: req.user._id }).populate({ path: "courseId", populate: { path: "categoryId", select: "name" } });
    const data = await Promise.all(enrollments.map(async (enrollment) => {
      const courseId = enrollment.courseId?._id;
      const contentIds = await Content.find({ courseId, status: "PUBLISHED", deletedAt: null }).distinct("_id");
      const [total, completed, assessmentCount, completedAssessments] = await Promise.all([
        Promise.resolve(contentIds.length),
        Progress.countDocuments({ enrollmentId: enrollment._id, contentId: { $in: contentIds }, completed: true }),
        Assessment.countDocuments({ courseId, status: "PUBLISHED" }),
        Attempt.distinct("assessmentId", { enrollmentId: enrollment._id, status: { $in: ["SUBMITTED", "TIMED_OUT"] } }),
      ]);
      return { enrollment, progressPercent: total ? Math.round(completed * 100 / total) : 0, completedContent: completed, totalContent: total, assessmentCount, completedAssessments: completedAssessments.length };
    }));
    const enrolledCourseIds = enrollments.map((enrollment) => enrollment.courseId?._id).filter(Boolean);
    const previewCourseIds = await Content.distinct("courseId", { status: "PUBLISHED", deletedAt: null, accessLevel: "FREE", courseId: { $nin: enrolledCourseIds } });
    const previewCourses = await Course.find({ _id: { $in: previewCourseIds }, status: "PUBLISHED" }).populate("categoryId", "name");
    for (const course of previewCourses) {
      const [total, assessmentCount] = await Promise.all([
        Content.countDocuments({ courseId: course._id, status: "PUBLISHED", deletedAt: null, accessLevel: "FREE" }),
        Assessment.countDocuments({ courseId: course._id, status: "PUBLISHED" }),
      ]);
      data.push({ courseId: course, progressPercent: 0, completedContent: 0, totalContent: total, assessmentCount, isFreePreview: true });
    }
    data.sort((a, b) => Number(a.enrollment?.courseId?.displayOrder ?? a.courseId?.displayOrder ?? 0) - Number(b.enrollment?.courseId?.displayOrder ?? b.courseId?.displayOrder ?? 0));
    ok(res, "My courses fetched successfully.", { courses: data });
  } catch (error) { next(error); }
}

export async function progressSummary(req, res, next) {
  try {
    const now = new Date();
    const enrollments = await Enrollment.find({ learnerId: req.user._id, status: { $in: ["ACTIVE", "COMPLETED"] }, deletedAt: null }).populate("courseId", "title thumbnail displayOrder");
    const validEnrollments = enrollments.filter((item) => item.courseId);
    const enrollmentIds = validEnrollments.map((item) => item._id);
    const courseIds = [...new Set(validEnrollments.map((item) => String(item.courseId._id)))];
    const [contentCounts, lessonProgress, assessments, certificates, activities] = await Promise.all([
      Content.aggregate([{ $match: { courseId: { $in: validEnrollments.map((item) => item.courseId._id) }, status: "PUBLISHED", deletedAt: null } }, { $group: { _id: "$courseId", total: { $sum: 1 } } }]),
      Progress.aggregate([{ $match: { learnerId: req.user._id, enrollmentId: { $in: enrollmentIds } } }, { $group: { _id: "$courseId", completed: { $sum: { $cond: ["$completed", 1, 0] } }, watchedSeconds: { $sum: "$watchedSeconds" } } }]),
      Assessment.find({ courseId: { $in: validEnrollments.map((item) => item.courseId._id) }, status: "PUBLISHED", deletedAt: null }).select("courseId title type showResults"),
      Certificate.countDocuments({ learnerId: req.user._id, status: "VALID", deletedAt: null }),
      LearnerActivity.find({ learnerId: req.user._id, day: { $gte: activityDayKey(new Date(now.getTime() - 400 * 86400000)) } }).sort({ day: -1 }).select("day completedLessons"),
    ]);
    const courseTotals = new Map(contentCounts.map((item) => [String(item._id), Number(item.total)]));
    const courseProgress = new Map(lessonProgress.map((item) => [String(item._id), item]));
    const courses = validEnrollments.map((enrollment) => {
      const course = enrollment.courseId;
      const stats = courseProgress.get(String(course._id));
      const totalLessons = courseTotals.get(String(course._id)) || 0;
      const completedLessons = Math.min(totalLessons, Number(stats?.completed || 0));
      const progressPercent = totalLessons ? Math.round(completedLessons * 100 / totalLessons) : 0;
      return { id: String(course._id), title: course.title, image: course.thumbnail?.url || "", completedLessons, totalLessons, progressPercent, status: progressPercent === 100 && totalLessons > 0 ? "Completed" : "In Progress", statusType: progressPercent === 100 && totalLessons > 0 ? "completed" : "progress", displayOrder: course.displayOrder || 0 };
    }).sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title));
    const totalLessons = courses.reduce((sum, course) => sum + course.totalLessons, 0);
    const completedLessons = courses.reduce((sum, course) => sum + course.completedLessons, 0);
    const overallProgress = totalLessons ? Math.round(completedLessons * 100 / totalLessons) : 0;
    const completedCourses = courses.filter((course) => course.statusType === "completed").length;
    const assessmentIds = assessments.map((item) => item._id);
    const attempts = assessmentIds.length ? await Attempt.find({ learnerId: req.user._id, assessmentId: { $in: assessmentIds }, status: { $in: ["SUBMITTED", "TIMED_OUT"] } }).sort({ submittedAt: -1 }).select("assessmentId percentage submittedAt timeTakenSeconds") : [];
    const attemptsByAssessment = new Map();
    for (const attempt of attempts) if (!attemptsByAssessment.has(String(attempt.assessmentId))) attemptsByAssessment.set(String(attempt.assessmentId), attempt);
    const assessmentById = new Map(assessments.map((item) => [String(item._id), item]));
    const growthByCourse = new Map();
    for (const [assessmentId, attempt] of attemptsByAssessment) {
      const assessment = assessmentById.get(assessmentId);
      if (!assessment?.showResults || !Number.isFinite(Number(attempt.percentage))) continue;
      const key = String(assessment.courseId);
      const row = growthByCourse.get(key) || { preScore: null, postScore: null };
      if (assessment.type === "PRE") row.preScore = Number(attempt.percentage);
      if (assessment.type === "POST") row.postScore = Number(attempt.percentage);
      growthByCourse.set(key, row);
    }
    const assessmentGrowth = courses.map((course) => ({ courseId: course.id, title: course.title, ...(growthByCourse.get(course.id) || {}) }))
      .filter((row) => Number.isFinite(row.preScore) && Number.isFinite(row.postScore))
      .map((row) => ({ ...row, improvement: Math.round((row.postScore - row.preScore) * 10) / 10 }));
    const averageImprovement = assessmentGrowth.length ? Math.round(assessmentGrowth.reduce((sum, row) => sum + row.improvement, 0) / assessmentGrowth.length) : null;
    const activityDays = activities.map((item) => item.day);
    const activitySet = new Set(activityDays);
    const today = activityDayKey(now);
    const yesterday = activityDayKey(new Date(now.getTime() - 86400000));
    let currentStreak = 0;
    const cursor = new Date(`${activitySet.has(today) ? today : yesterday}T00:00:00.000Z`);
    while (activitySet.has(activityDayKey(cursor))) { currentStreak += 1; cursor.setUTCDate(cursor.getUTCDate() - 1); }
    const monday = new Date(now);
    monday.setUTCHours(0, 0, 0, 0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const week = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setUTCDate(date.getUTCDate() + index); const day = activityDayKey(date); return { day, active: activitySet.has(day) }; });
    ok(res, "Learning progress fetched successfully.", {
      summary: { enrolledCourses: courses.length, completedCourses, overallProgress, completedLessons, totalLessons, assessmentsAttempted: attemptsByAssessment.size, totalAssessments: assessments.length, trackedLearningSeconds: lessonProgress.reduce((sum, row) => sum + Number(row.watchedSeconds || 0), 0), certificates, averageImprovement },
      courses, assessmentGrowth, streak: { currentDays: currentStreak, week, completedLessonsByDay: Object.fromEntries(activities.map((item) => [item.day, item.completedLessons])) },
      activityStartedAt: activities.at(-1)?.day || null,
    });
  } catch (error) { next(error); }
}
function safeLearnerContent(content) {
  const row = content.toObject();
  if (content.type === "VIDEO") {
    if (content.file?.provider === "CLOUDFLARE_STREAM" || content.cloudflareVideoId) {
      const code = env.cloudflareStream.customerCode;
      row.playbackProvider = "CLOUDFLARE_STREAM";
      row.playbackUrl = content.cloudflareVideoId && code ? `https://customer-${code}.cloudflarestream.com/${content.cloudflareVideoId}/iframe` : "";
    } else {
      row.playbackProvider = "HTML5";
      row.playbackUrl = content.file?.url || "";
    }
    if (!content.downloadable && row.file) delete row.file.url;
  } else if (content.type === "PDF") {
    row.readerUrl = `/api/learner/content/${content.id}/pdf`;
    if (!content.downloadable && row.file) delete row.file.url;
  } else if (!content.downloadable && row.file) delete row.file.url;
  return row;
}

export async function coursePlayer(req, res, next) {
  try {
    const now = new Date(); await publishDueContent(now);
    const course = await Course.findOne({ _id: req.params.courseId, status: "PUBLISHED" }).populate("categoryId", "name").populate("trainerIds", "name email profileImage");
    if (!course) throw new AppError("Course was not found.", { code: "COURSE_NOT_FOUND", statusCode: 404 });
    const enrollment = await Enrollment.findOne({ learnerId: req.user._id, courseId: course._id, status: { $in: ["ACTIVE", "COMPLETED"] }, startDate: { $lte: now }, expiryDate: { $gt: now } }).sort({ expiryDate: -1 });
    const contentFilter = { courseId: course._id, status: "PUBLISHED", deletedAt: null };
    if (!enrollment) contentFilter.accessLevel = "FREE";
    const content = await Content.find(contentFilter).populate("moduleId").sort({ order: 1 });
    if (!enrollment && !content.length) throw new AppError("An active enrollment or free course preview is required.", { code: "ENROLLMENT_NOT_FOUND", statusCode: 403 });
    const progress = enrollment ? await Progress.find({ enrollmentId: enrollment._id }) : [];
    ok(res, "Course player data fetched successfully.", { course, enrollment, content: content.map(safeLearnerContent), progress });
  } catch (error) { next(error); }
}

export async function getContentForLearner(req, res, next) {
  try {
    await publishDueContent();
    const content = await Content.findOne({ _id: req.params.id, deletedAt: null });
    if (!content || content.status !== "PUBLISHED") throw new AppError("Content was not found.", { code: "NOT_FOUND", statusCode: 404 });
    if (content.accessLevel !== "FREE") await checkEnrollmentAccess({ learnerId: req.user._id, courseId: content.courseId });
    else if (!await Course.exists({ _id: content.courseId, status: "PUBLISHED" })) throw new AppError("Content was not found.", { code: "NOT_FOUND", statusCode: 404 });
    ok(res, "Course content fetched successfully.", { content: safeLearnerContent(content) });
  } catch (error) { next(error); }
}
export async function saveProgress(req, res, next) { try { const content = await Content.findOne({ _id: req.body.contentId, deletedAt: null }); if (!content) throw new AppError("Course content was not found.", { code: "NOT_FOUND", statusCode: 404 }); const enrollment = await checkEnrollmentAccess({ learnerId: req.user._id, courseId: content.courseId }); const percent = Number(req.body.progressPercent); if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new AppError("Progress percent must be between 0 and 100.", { code: "VALIDATION_ERROR", statusCode: 400 }); const key = { learnerId: req.user._id, enrollmentId: enrollment._id, contentId: content._id }; const existing = await Progress.findOne(key).select("completed"); const complete = percent >= 90 || req.body.completed === true; const update = { progressPercent: percent, watchedSeconds: Math.max(0, Number(req.body.watchedSeconds) || 0), lastPosition: Math.max(0, Number(req.body.lastPosition) || 0) }; if (complete) { update.completed = true; update.completedAt = existing?.completed ? undefined : new Date(); } const progress = await Progress.findOneAndUpdate(key, { $set: update, $setOnInsert: { courseId: content.courseId } }, { new: true, upsert: true, runValidators: true }); if (complete || Number(req.body.watchedSeconds) >= 30) await recordLearnerActivity(req.user._id, complete && !existing?.completed ? 1 : 0); ok(res, "Progress saved successfully.", { progress }); } catch (e) { next(e); } }
export async function courseProgress(req, res, next) { try { const enrollment = await checkEnrollmentAccess({ learnerId: req.user._id, courseId: req.params.courseId }); const contentIds = await Content.find({ courseId: req.params.courseId, status: "PUBLISHED", deletedAt: null }).distinct("_id"); const progress = await Progress.find({ enrollmentId: enrollment.id, contentId: { $in: contentIds } }).populate("contentId", "title type durationSeconds"); const total = contentIds.length; const completed = progress.filter((item) => item.completed).length; ok(res, "Course progress fetched successfully.", { enrollment, progress, completionPercent: total ? Math.round((completed / total) * 100) : 0 }); } catch (e) { next(e); } }
export async function myCertificates(req, res, next) { try { ok(res, "Certificates fetched successfully.", await list(Certificate, { learnerId: req.user._id }, req.query, "courseId enrollmentId certificateTemplateId")); } catch (e) { next(e); } }
export async function verifyCertificate(req, res, next) { try { const certificate = await Certificate.findOne({ verificationCode: req.params.code, status: "VALID", deletedAt: null }).populate("learnerId", "name").populate("courseId", "title"); if (!certificate) throw new AppError("Certificate was not found or is no longer valid.", { code: "CERTIFICATE_NOT_FOUND", statusCode: 404 }); ok(res, "Certificate is valid.", { certificate }); } catch (e) { next(e); } }
export async function myTrainers(req, res, next) {
  try {
    const enrollments = await Enrollment.find({ learnerId: req.user._id, status: { $in: ["ACTIVE", "COMPLETED"] }, deletedAt: null }).populate({ path: "courseId", select: "title trainerIds", populate: { path: "trainerIds", select: "name email profileImage role status" } });
    const contacts = new Map();
    for (const enrollment of enrollments) for (const trainer of enrollment.courseId?.trainerIds || []) {
      if (trainer.status !== "ACTIVE") continue;
      const id = String(trainer._id);
      const contact = contacts.get(id) || { _id: id, name: trainer.name, email: trainer.email, profileImage: trainer.profileImage, role: trainer.role, courses: [] };
      if (!contact.courses.some((course) => course.id === String(enrollment.courseId._id))) contact.courses.push({ id: String(enrollment.courseId._id), title: enrollment.courseId.title });
      contacts.set(id, contact);
    }
    ok(res, "Assigned trainers fetched successfully.", { trainers: [...contacts.values()] });
  } catch (error) { next(error); }
}

export async function trainerMessageContacts(req, res, next) {
  try {
    const courses = await Course.find({ trainerIds: req.user._id, deletedAt: null }).select("title");
    const courseIds = courses.map((course) => course._id);
    const enrollments = await Enrollment.find({ courseId: { $in: courseIds }, status: { $in: ["ACTIVE", "COMPLETED"] }, deletedAt: null }).distinct("learnerId");
    const learners = await User.find({ _id: { $in: enrollments }, role: "LEARNER", status: "ACTIVE", deletedAt: null }).select("name email profileImage").sort({ name: 1 });
    const enrollmentRows = await Enrollment.find({ courseId: { $in: courseIds }, learnerId: { $in: learners.map((learner) => learner._id) }, status: { $in: ["ACTIVE", "COMPLETED"] }, deletedAt: null }).populate("courseId", "title").select("learnerId courseId");
    const coursesByLearner = new Map();
    for (const enrollment of enrollmentRows) {
      const key = String(enrollment.learnerId);
      const values = coursesByLearner.get(key) || [];
      if (enrollment.courseId && !values.some((item) => item.id === String(enrollment.courseId._id))) values.push({ id: String(enrollment.courseId._id), title: enrollment.courseId.title });
      coursesByLearner.set(key, values);
    }
    ok(res, "Enrolled learners fetched successfully.", { learners: learners.map((learner) => ({ _id: String(learner._id), name: learner.name, email: learner.email, profileImage: learner.profileImage, courses: coursesByLearner.get(String(learner._id)) || [] })) });
  } catch (error) { next(error); }
}

async function assertMessagePairAllowed(sender, recipient) {
  if (["ADMIN", "SUPER_ADMIN"].includes(sender.role)) return;
  let learnerId;
  let trainerId;
  if (sender.role === "LEARNER" && recipient.role === "TRAINER") { learnerId = sender._id; trainerId = recipient._id; }
  else if (sender.role === "TRAINER" && recipient.role === "LEARNER") { learnerId = recipient._id; trainerId = sender._id; }
  else throw new AppError("Messages are available between learners and their assigned trainers.", { code: "FORBIDDEN", statusCode: 403 });
  const enrollments = await Enrollment.find({ learnerId, status: { $in: ["ACTIVE", "COMPLETED"] }, deletedAt: null }).distinct("courseId");
  if (!enrollments.length || !await Course.exists({ _id: { $in: enrollments }, trainerIds: trainerId, deletedAt: null })) throw new AppError("You can message trainers assigned to your enrolled courses.", { code: "FORBIDDEN", statusCode: 403 });
}

export async function myNotifications(req, res, next) { try { ok(res, "Notifications fetched successfully.", await list(Notification, { recipientId: req.user._id }, { ...req.query, limit: req.query.limit || 20 }, "", { createdAt: -1 })); } catch (e) { next(e); } }
export async function readNotification(req, res, next) { try { const notification = await Notification.findOneAndUpdate({ _id: req.params.id, recipientId: req.user._id }, { read: true }, { new: true }); if (!notification) throw new AppError("Notification was not found.", { code: "NOT_FOUND", statusCode: 404 }); ok(res, "Notification marked as read.", { notification }); } catch (e) { next(e); } }
export async function readAllNotifications(req, res, next) { try { const result = await Notification.updateMany({ recipientId: req.user._id, read: false }, { $set: { read: true } }); ok(res, "Notifications marked as read.", { updatedCount: result.modifiedCount }); } catch (e) { next(e); } }
export async function listMessages(req, res, next) { try { const filter = { $or: [{ senderId: req.user._id }, { recipientId: req.user._id }] }; if (req.query.withUserId) filter.$or = [{ senderId: req.user._id, recipientId: req.query.withUserId }, { senderId: req.query.withUserId, recipientId: req.user._id }]; const data = await list(Message, filter, { ...req.query, limit: req.query.limit || 100 }, "senderId recipientId", { createdAt: 1 }); ok(res, "Messages fetched successfully.", data); } catch (e) { next(e); } }
export async function markMessagesRead(req, res, next) { try { const otherUserId = req.body.withUserId; if (!otherUserId) throw new AppError("Conversation partner is required.", { code: "VALIDATION_ERROR", statusCode: 400 }); const result = await Message.updateMany({ senderId: otherUserId, recipientId: req.user._id, readAt: null }, { $set: { readAt: new Date() } }); ok(res, "Messages marked as read.", { updatedCount: result.modifiedCount }); } catch (e) { next(e); } }
export async function sendMessage(req, res, next) { try { if (!req.body.recipientId || !req.body.body?.trim()) throw new AppError("Recipient and message are required.", { code: "VALIDATION_ERROR", statusCode: 400 }); const recipient = await User.findOne({ _id: req.body.recipientId, status: "ACTIVE", deletedAt: null }); if (!recipient) throw new AppError("Message recipient was not found.", { code: "NOT_FOUND", statusCode: 404 }); await assertMessagePairAllowed(req.user, recipient); const message = await Message.create({ senderId: req.user._id, recipientId: recipient._id, body: req.body.body.trim() }); Notification.create({ recipientId: recipient._id, type: "MESSAGE", title: "New message", message: `${req.user.name} sent you a message.`, metadata: { senderId: String(req.user._id), path: req.user.role === "LEARNER" ? "/trainer/messages" : "/student/messages" } }).catch((error) => console.error("Message notification failed:", error.message)); ok(res, "Message sent successfully.", { message }, 201); } catch (e) { next(e); } }
export async function listTickets(req, res, next) { try { const filter = ["ADMIN", "SUPER_ADMIN"].includes(req.user.role) ? {} : { requesterId: req.user._id }; ok(res, "Support requests fetched successfully.", await list(SupportTicket, filter, req.query, "requesterId")); } catch (e) { next(e); } }
export async function createTicket(req, res, next) { try { const ticket = await SupportTicket.create({ ...req.body, requesterId: req.user._id }); ok(res, "Support request created successfully.", { ticket }, 201); } catch (e) { next(e); } }
export async function updateTicket(req, res, next) {
  try {
    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) throw new AppError("Only administrators can update support requests.", { code: "FORBIDDEN", statusCode: 403 });
    const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    if (!statuses.includes(req.body.status)) throw new AppError("Choose a valid support status.", { code: "VALIDATION_ERROR", statusCode: 400 });
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) throw new AppError("Support request was not found.", { code: "NOT_FOUND", statusCode: 404 });
    ticket.status = req.body.status;
    ticket.resolvedAt = ["RESOLVED", "CLOSED"].includes(ticket.status) ? new Date() : undefined;
    await ticket.save();
    ok(res, "Support request updated successfully.", { ticket });
  } catch (error) { next(error); }
}
export async function dashboard(req, res, next) { try { const enrollments = await Enrollment.find({ learnerId: req.user._id, status: { $in: ["ACTIVE", "UPCOMING", "COMPLETED"] } }); const [attempts, certificates] = await Promise.all([Attempt.find({ learnerId: req.user._id, status: "SUBMITTED" }).sort({ submittedAt: -1 }).limit(5).populate("assessmentId"), Certificate.countDocuments({ learnerId: req.user._id, status: "VALID" })]); const upcoming = await Assessment.find({ courseId: { $in: enrollments.map((e) => e.courseId) }, status: "PUBLISHED" }).sort({ availableUntil: 1 }).limit(5); ok(res, "Dashboard fetched successfully.", { summary: { enrolledCourses: enrollments.length, certificates, completedAssessments: attempts.length }, enrollments, upcomingAssessments: upcoming, recentResults: attempts }); } catch (e) { next(e); } }




