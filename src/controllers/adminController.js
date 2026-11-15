import Attempt from "../models/Attempt.js";
import Assessment from "../models/Assessment.js";
import Certificate from "../models/Certificate.js";
import Content from "../models/Content.js";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Progress from "../models/Progress.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import Notification from "../models/Notification.js";
import Invoice from "../models/Invoice.js";
import CertificateTemplate from "../models/CertificateTemplate.js";
import { assertCourseManager } from "../services/courseAccessService.js";
import { audit } from "../services/auditService.js";
import AppError from "../utils/AppError.js";
import { list, ok } from "../utils/api.js";

const ids = () => `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
export async function listCertificateTemplates(req, res, next) { try { const items = await CertificateTemplate.find({ deletedAt: null }).sort({ active: -1, updatedAt: -1 }).lean(); ok(res, "Certificate templates fetched.", { items }); } catch (e) { next(e); } }
export async function createCertificateTemplate(req, res, next) { try { const { name, style, primaryColor, accentColor, backgroundImageUrl, logoUrl, signatureImageUrl, organizationName, certificateTitle, subtitle, bodyText, signatureText, borderStyle, active } = req.body || {}; if (!name?.trim()) throw new AppError("Template name is required.", { code: "VALIDATION_ERROR", statusCode: 400 }); const template = await CertificateTemplate.create({ name: name.trim(), style, primaryColor, accentColor, backgroundImageUrl, logoUrl, signatureImageUrl, organizationName, certificateTitle, subtitle, bodyText, signatureText, borderStyle, active: active !== false, createdBy: req.user._id }); ok(res, "Certificate template created.", { template }, 201); } catch (e) { next(e); } }
export async function updateCertificateTemplate(req, res, next) { try { const template = await CertificateTemplate.findOne({ _id: req.params.id, deletedAt: null }); if (!template) throw new AppError("Certificate template was not found.", { code: "NOT_FOUND", statusCode: 404 }); for (const field of ["name", "style", "primaryColor", "accentColor", "backgroundImageUrl", "logoUrl", "signatureImageUrl", "organizationName", "certificateTitle", "subtitle", "bodyText", "signatureText", "borderStyle", "active"]) if (req.body[field] !== undefined) template[field] = req.body[field]; await template.save(); ok(res, "Certificate template updated.", { template }); } catch (e) { next(e); } }
export async function deleteCertificateTemplate(req, res, next) { try { const template = await CertificateTemplate.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: { active: false, deletedAt: new Date() } }, { new: true }); if (!template) throw new AppError("Certificate template was not found.", { code: "NOT_FOUND", statusCode: 404 }); ok(res, "Certificate template removed.", { id: template.id }); } catch (e) { next(e); } }
export async function generateCertificate(req, res, next) { try { const enrollment = await Enrollment.findById(req.body.enrollmentId); if (!enrollment) throw new AppError("Enrollment was not found.", { code: "ENROLLMENT_NOT_FOUND", statusCode: 404 }); const course = await Course.findById(enrollment.courseId); if (!course) throw new AppError("Course was not found.", { code: "COURSE_NOT_FOUND", statusCode: 404 }); const requiredContentIds = await Content.find({ courseId: course.id, status: "PUBLISHED", deletedAt: null }).distinct("_id"); const total = requiredContentIds.length; const completed = await Progress.countDocuments({ enrollmentId: enrollment.id, contentId: { $in: requiredContentIds }, completed: true }); if (!total || completed < total) throw new AppError("Course completion criteria have not been met.", { code: "CERTIFICATE_NOT_ELIGIBLE", statusCode: 422 }); const post = await Attempt.findOne({ enrollmentId: enrollment.id, status: "SUBMITTED" }).populate("assessmentId").sort({ submittedAt: -1 }); if (course.completionRequiresPostPass && (!post || post.assessmentId.type !== "POST" || post.result !== "PASS")) throw new AppError("A passed post-assessment is required.", { code: "CERTIFICATE_NOT_ELIGIBLE", statusCode: 422 }); const existing = await Certificate.findOne({ enrollmentId: enrollment.id, courseId: course.id, status: "VALID" }); if (existing) return ok(res, "Certificate already exists.", { certificate: existing }); let template = req.body.templateId ? await CertificateTemplate.findOne({ _id: req.body.templateId, active: true, deletedAt: null }) : await CertificateTemplate.findOne({ active: true, deletedAt: null }).sort({ updatedAt: -1 }); if (req.body.templateId && !template) throw new AppError("Choose an active certificate template.", { code: "TEMPLATE_NOT_FOUND", statusCode: 404 }); const snapshot = template ? { name: template.name, style: template.style, primaryColor: template.primaryColor, accentColor: template.accentColor, backgroundImageUrl: template.backgroundImageUrl, logoUrl: template.logoUrl, signatureImageUrl: template.signatureImageUrl, organizationName: template.organizationName, certificateTitle: template.certificateTitle, subtitle: template.subtitle, bodyText: template.bodyText, signatureText: template.signatureText, borderStyle: template.borderStyle } : undefined; const certificate = await Certificate.create({ certificateNumber: `PEL-${ids()}`, verificationCode: ids(), learnerId: enrollment.learnerId, courseId: course.id, enrollmentId: enrollment.id, assessmentAttemptId: post?._id, score: post?.percentage, certificateTemplateId: template?._id, templateSnapshot: snapshot }); ok(res, "Certificate generated successfully.", { certificate }, 201); } catch (e) { next(e); } }
export async function trainerDashboard(req, res, next) {
  try {
    const courses = await Course.find({ trainerIds: req.user._id }).populate("categoryId", "name").sort({ displayOrder: 1, createdAt: -1 });
    const courseIds = courses.map((course) => course._id);
    const [learnerIds, contentCount, attempts] = await Promise.all([
      Enrollment.distinct("learnerId", { courseId: { $in: courseIds } }),
      Content.countDocuments({ courseId: { $in: courseIds }, deletedAt: null }),
      Attempt.find({ assessmentId: { $in: await Assessment.find({ courseId: { $in: courseIds } }).distinct("_id") }, status: { $in: ["SUBMITTED", "TIMED_OUT"] } }),
    ]);
    const averageScore = attempts.length ? Number((attempts.reduce((sum, attempt) => sum + (attempt.percentage || 0), 0) / attempts.length).toFixed(1)) : 0;
    const courseSummaries = await Promise.all(courses.map(async (course) => {
      const [courseLearners, lessons, assessments, completion] = await Promise.all([
        Enrollment.distinct("learnerId", { courseId: course._id, status: { $in: ["ACTIVE", "COMPLETED"] } }),
        Content.countDocuments({ courseId: course._id, deletedAt: null }),
        Assessment.countDocuments({ courseId: course._id }),
        Progress.aggregate([{ $match: { courseId: course._id } }, { $group: { _id: "$learnerId", progress: { $avg: "$progressPercent" } } }, { $group: { _id: null, average: { $avg: "$progress" } } }]),
      ]);
      return { ...course.toObject(), stats: { learners: courseLearners.length, lessons, assessments, completion: Math.round(completion[0]?.average || 0) } };
    }));
    ok(res, "Trainer dashboard fetched successfully.", { summary: { assignedCourses: courses.length, learners: learnerIds.length, content: contentCount, averageScore }, courses: courseSummaries });
  } catch (e) { next(e); }
}export async function reports(req, res, next) { try { if (req.query.type === "learner") { const rows = await Enrollment.find(req.query.learnerId ? { learnerId: req.query.learnerId } : {}).populate("learnerId courseId"); return ok(res, "Learner report fetched successfully.", { rows }); } const courses = await Course.find(req.query.courseId ? { _id: req.query.courseId } : {}); const rows = await Promise.all(courses.map(async (course) => ({ course, enrollments: await Enrollment.countDocuments({ courseId: course.id }), averageScore: (await Attempt.aggregate([{ $lookup: { from: "assessments", localField: "assessmentId", foreignField: "_id", as: "assessment" } }, { $match: { "assessment.courseId": course._id, status: "SUBMITTED" } }, { $group: { _id: null, value: { $avg: "$percentage" } } }]))[0]?.value || 0 }))); ok(res, "Course report fetched successfully.", { rows }); } catch (e) { next(e); } }

export async function listNotifications(req, res, next) {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const items = await AuditLog.find({ actorId: req.user._id, action: "NOTIFICATION_SENT" }).sort({ createdAt: -1 }).limit(limit).lean();
    ok(res, "Notification campaigns fetched successfully.", { items });
  } catch (error) { next(error); }
}

export async function listAuditLogs(req, res, next) {
  try {
    const result = await list(AuditLog, {}, req.query, "actorId", { createdAt: -1 });
    ok(res, "Audit logs fetched successfully.", result);
  } catch (error) { next(error); }
}

export async function listInvoices(req, res, next) {
  try { ok(res, "Invoices fetched successfully.", await list(Invoice, { deletedAt: null }, req.query, "createdBy", { date: -1, createdAt: -1 })); }
  catch (error) { next(error); }
}

export async function createInvoice(req, res, next) {
  try {
    const invoice = await Invoice.create({ ...req.body, createdBy: req.user._id });
    await audit(req.user._id, "INVOICE_CREATED", "Invoice", invoice._id, { invoiceNumber: invoice.invoiceNumber });
    ok(res, "Invoice record created successfully.", { invoice }, 201);
  } catch (error) { next(error); }
}

export async function updateInvoice(req, res, next) {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, deletedAt: null });
    if (!invoice) throw new AppError("Invoice was not found.", { code: "NOT_FOUND", statusCode: 404 });
    for (const field of ["invoiceNumber", "customer", "plan", "amount", "date", "paymentMethod", "status"]) if (req.body[field] !== undefined) invoice[field] = req.body[field];
    await invoice.save();
    await audit(req.user._id, "INVOICE_UPDATED", "Invoice", invoice._id, { invoiceNumber: invoice.invoiceNumber });
    ok(res, "Invoice record updated successfully.", { invoice });
  } catch (error) { next(error); }
}

export async function deleteInvoice(req, res, next) {
  try {
    const invoice = await Invoice.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: { deletedAt: new Date() } }, { new: true });
    if (!invoice) throw new AppError("Invoice was not found.", { code: "NOT_FOUND", statusCode: 404 });
    await audit(req.user._id, "INVOICE_DELETED", "Invoice", invoice._id, { invoiceNumber: invoice.invoiceNumber });
    ok(res, "Invoice record deleted successfully.", { id: invoice.id });
  } catch (error) { next(error); }
}

export async function sendNotification(req, res, next) {
  try {
    const { audience = "LEARNERS", title, body } = req.body || {};
    if (typeof title !== "string" || !title.trim() || title.trim().length > 180 || typeof body !== "string" || !body.trim() || body.trim().length > 2000) {
      throw new AppError("Enter a title and message. Keep the title under 180 characters and message under 2,000.", { code: "VALIDATION_ERROR", statusCode: 400 });
    }
    const now = new Date();
    let recipientFilter = { status: "ACTIVE", deletedAt: null, "notificationPreferences.inApp": { $ne: false } };
    if (audience === "LEARNERS") recipientFilter.role = "LEARNER";
    else if (audience === "TRAINERS") recipientFilter.role = "TRAINER";
    else if (audience === "ADMINS") recipientFilter.role = { $in: ["ADMIN", "SUPER_ADMIN"] };
    else if (audience === "EXPIRING_LEARNERS") {
      const learnerIds = await Enrollment.distinct("learnerId", { status: "ACTIVE", deletedAt: null, expiryDate: { $gt: now, $lte: new Date(now.getTime() + 30 * 86400000) } });
      recipientFilter._id = { $in: learnerIds };
      recipientFilter.role = "LEARNER";
    } else if (audience !== "ALL_USERS") throw new AppError("Choose a valid notification audience.", { code: "VALIDATION_ERROR", statusCode: 400 });

    const recipients = await User.find(recipientFilter).select("_id").lean();
    if (!recipients.length) throw new AppError("There are no active users in this audience.", { code: "NO_RECIPIENTS", statusCode: 422 });
    const campaignId = ids();
    await Notification.insertMany(recipients.map(({ _id }) => ({ recipientId: _id, type: "ANNOUNCEMENT", title: title.trim(), message: body.trim(), metadata: { campaignId, audience } })));
    const campaign = await audit(req.user._id, "NOTIFICATION_SENT", "Notification", undefined, { campaignId, audience, channel: "IN_APP", title: title.trim(), body: body.trim(), recipientCount: recipients.length });
    ok(res, "In-app notification sent successfully.", { campaign, recipientCount: recipients.length }, 201);
  } catch (error) { next(error); }
}

export async function trainerActivity(req, res, next) {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const items = await AuditLog.find({
      actorId: req.user._id,
      action: { $in: ["CONTENT_CREATED", "CONTENT_PUBLISHED", "CONTENT_SCHEDULED", "ASSESSMENT_CREATED", "ASSESSMENT_PUBLISHED", "RESULTS_VIEWED"] },
    }).sort({ createdAt: -1 }).limit(limit).lean();
    ok(res, "Trainer activity fetched successfully.", { items });
  } catch (error) { next(error); }
}

export async function logTrainerResultsViewed(req, res, next) {
  try {
    const courseId = req.body?.courseId || null;
    let courseTitle = "All assigned courses";
    if (courseId) {
      const course = await assertCourseManager(req.user, courseId);
      courseTitle = course.title;
    }
    const entry = await audit(req.user._id, "RESULTS_VIEWED", "Assessment", undefined, { courseId, courseTitle });
    ok(res, "Results view recorded.", { id: entry.id });
  } catch (error) { next(error); }
}

export async function trainerCourseCheck(req, res, next) { try { const course = await assertCourseManager(req.user, req.params.courseId); ok(res, "Course management access confirmed.", { course }); } catch (e) { next(e); } }
export async function adminSummary(req, res, next) { try { const [learners, courses, enrollments, certificates] = await Promise.all([User.countDocuments({ role: "LEARNER" }), Course.countDocuments(), Enrollment.countDocuments(), Certificate.countDocuments({ status: "VALID" })]); ok(res, "Admin analytics fetched successfully.", { learners, courses, enrollments, certificates }); } catch (e) { next(e); } }

export async function deleteCertificate(req, res, next) { try { const certificate = await Certificate.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: { status: "REVOKED", deletedAt: new Date() } }, { new: true }); if (!certificate) throw new AppError("Certificate was not found.", { code: "NOT_FOUND", statusCode: 404 }); ok(res, "Certificate deleted successfully.", { id: certificate.id }); } catch (e) { next(e); } }
export async function listCertificates(req, res, next) { try { ok(res, "Certificates fetched successfully.", await (await import("../utils/api.js")).list(Certificate, { deletedAt: null }, req.query, "learnerId courseId enrollmentId")); } catch (e) { next(e); } }






