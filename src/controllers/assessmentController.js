import Assessment from "../models/Assessment.js";
import Attempt from "../models/Attempt.js";
import Question from "../models/Question.js";
import Course from "../models/Course.js";
import Module from "../models/Module.js";
import { assertCourseManager } from "../services/courseAccessService.js";
import { checkEnrollmentAccess } from "../services/enrollmentService.js";
import { audit } from "../services/auditService.js";
import AppError from "../utils/AppError.js";
import { list, ok, parsePagination } from "../utils/api.js";

const canManage = ["ADMIN", "SUPER_ADMIN"];
async function assertAssessmentManager(user, assessment) { if (canManage.includes(user.role)) return; await assertCourseManager(user, assessment.courseId); }
export async function listAssessments(req, res, next) {
  try {
    const filter = { deletedAt: null };
    if (req.query.courseId) filter.courseId = req.query.courseId;
    if (req.query.type) filter.type = req.query.type;
    if (req.user.role === "LEARNER") filter.status = "PUBLISHED";
    if (req.user.role === "TRAINER") filter.courseId = { $in: await Course.find({ trainerIds: req.user._id }).distinct("_id") };
    const result = await list(Assessment, filter, req.query, "courseId moduleId", { createdAt: -1 });
    const ids = result.items.map((assessment) => assessment._id);
    const questionCounts = await Question.aggregate([{ $match: { assessmentId: { $in: ids } } }, { $group: { _id: "$assessmentId", count: { $sum: 1 } } }]);
    const countsByAssessment = new Map(questionCounts.map((item) => [String(item._id), item.count]));
    result.items = result.items.map((assessment) => ({ ...assessment.toObject(), questionCount: countsByAssessment.get(String(assessment._id)) || 0 }));
    ok(res, "Assessments fetched successfully.", result);
  } catch (error) { next(error); }
}export async function getAssessment(req, res, next) { try { const assessment = await Assessment.findById(req.params.id); if (!assessment) throw new AppError("Assessment was not found.", { code: "ASSESSMENT_NOT_AVAILABLE", statusCode: 404 }); if (req.user.role === "LEARNER") { await checkEnrollmentAccess({ learnerId: req.user._id, courseId: assessment.courseId }); if (assessment.status !== "PUBLISHED") throw new AppError("Assessment is not available.", { code: "ASSESSMENT_NOT_AVAILABLE", statusCode: 403 }); } else if (req.user.role === "TRAINER") await assertCourseManager(req.user, assessment.courseId); const query = Question.find({ assessmentId: assessment.id }).sort({ order: 1 }); if (req.user.role !== "LEARNER") query.select("+correctOptionKey +correctOptionKeys"); let questions = await query; if (req.user.role === "LEARNER") { if (assessment.shuffleQuestions) questions = questions.sort(() => Math.random() - 0.5); if (assessment.shuffleOptions) questions = questions.map((question) => { question.options = [...question.options].sort(() => Math.random() - 0.5); return question; }); } ok(res, "Assessment fetched successfully.", { assessment, questions }); } catch (e) { next(e); } }
export async function createAssessment(req, res, next) {
  try {
    const course = await assertCourseManager(req.user, req.body.courseId);
    if (req.body.moduleId && !await Module.exists({ _id: req.body.moduleId, courseId: req.body.courseId, status: "ACTIVE", deletedAt: null })) {
      throw new AppError("Module does not belong to the selected course.", { code: "VALIDATION_ERROR", statusCode: 400 });
    }

    const assessment = await Assessment.create({
      courseId: req.body.courseId,
      moduleId: req.body.moduleId,
      title: req.body.title,
      description: req.body.description,
      type: req.body.type,
      totalMarks: req.body.totalMarks,
      passingMarks: req.body.passingMarks,
      durationMinutes: req.body.durationMinutes,
      attemptLimit: req.body.attemptLimit,
      showResults: req.body.showResults,
      shuffleQuestions: req.body.shuffleQuestions,
      shuffleOptions: req.body.shuffleOptions,
      draftQuestions: req.body.draftQuestions,
      status: "DRAFT",
      createdBy: req.user._id,
    });

    // The assessment is already saved. An audit outage must not make the client
    // report that creation failed or encourage a duplicate retry.
    audit(req.user._id, "ASSESSMENT_CREATED", "Assessment", assessment._id, {
      title: assessment.title,
      type: assessment.type,
      courseId: String(course._id),
      courseTitle: course.title,
    }).catch((error) => console.error("Assessment creation audit failed:", error.message));

    ok(res, "Assessment created successfully.", { assessment }, 201);
  } catch (error) { next(error); }
}
export async function updateAssessment(req, res, next) { try { const assessment = await Assessment.findById(req.params.id); if (!assessment) throw new AppError("Assessment was not found.", { code: "NOT_FOUND", statusCode: 404 }); await assertAssessmentManager(req.user, assessment); const courseId = req.body.courseId || assessment.courseId; const moduleId = req.body.moduleId || assessment.moduleId; await assertCourseManager(req.user, courseId); if (moduleId && !await Module.exists({ _id: moduleId, courseId, status: "ACTIVE" })) throw new AppError("Module does not belong to the selected course.", { code: "VALIDATION_ERROR", statusCode: 400 }); const updates = { ...req.body }; delete updates.status; Object.assign(assessment, updates); await assessment.save(); ok(res, "Assessment updated successfully.", { assessment }); } catch (e) { next(e); } }
export async function publishAssessment(req, res, next) { try { const assessment = await Assessment.findOne({ _id: req.params.id, deletedAt: null }); if (!assessment) throw new AppError("Assessment was not found.", { code: "NOT_FOUND", statusCode: 404 }); await assertAssessmentManager(req.user, assessment); const course = await assertCourseManager(req.user, assessment.courseId); const questions = await Question.find({ assessmentId: assessment.id }).select("+correctOptionKey +correctOptionKeys"); if (!questions.length || questions.some((q) => q.type !== "DESCRIPTIVE" && !(q.correctOptionKeys?.length || q.correctOptionKey))) throw new AppError("Add complete questions before publishing.", { code: "VALIDATION_ERROR", statusCode: 422 }); const marks = questions.reduce((sum, q) => sum + q.marks, 0); if (marks !== assessment.totalMarks) throw new AppError("Question marks must equal total marks.", { code: "VALIDATION_ERROR", statusCode: 422 }); assessment.status = "PUBLISHED"; await assessment.save(); audit(req.user._id, "ASSESSMENT_PUBLISHED", "Assessment", assessment._id, { title: assessment.title, type: assessment.type, courseId: String(course._id), courseTitle: course.title }).catch((error) => console.error("Assessment publish audit failed:", error.message)); ok(res, "Assessment published successfully.", { assessment }); } catch (e) { next(e); } }
export async function addQuestion(req, res, next) { try { const assessment = await Assessment.findById(req.params.assessmentId); if (!assessment) throw new AppError("Assessment was not found.", { code: "NOT_FOUND", statusCode: 404 }); await assertAssessmentManager(req.user, assessment); const question = await Question.create({ ...req.body, assessmentId: assessment.id }); ok(res, "Question created successfully.", { question }, 201); } catch (e) { next(e); } }
export async function replaceQuestions(req, res, next) { try { const assessment = await Assessment.findById(req.params.assessmentId); if (!assessment) throw new AppError("Assessment was not found.", { code: "NOT_FOUND", statusCode: 404 }); await assertAssessmentManager(req.user, assessment); if (!Array.isArray(req.body.questions)) throw new AppError("Questions must be an array.", { code: "VALIDATION_ERROR", statusCode: 400 }); const replacements = req.body.questions.map((question, order) => new Question({ ...question, order, assessmentId: assessment._id })); for (const question of replacements) await question.validate(); await Question.deleteMany({ assessmentId: assessment._id }); const questions = replacements.length ? await Question.insertMany(replacements) : []; ok(res, "Assessment questions saved successfully.", { questions }); } catch (e) { next(e); } }
export async function updateQuestion(req, res, next) { try { const question = await Question.findById(req.params.id).select("+correctOptionKey"); if (!question) throw new AppError("Question was not found.", { code: "NOT_FOUND", statusCode: 404 }); const assessment = await Assessment.findById(question.assessmentId); await assertAssessmentManager(req.user, assessment); Object.assign(question, req.body); await question.save(); ok(res, "Question updated successfully.", { question }); } catch (e) { next(e); } }
export async function deleteAssessment(req, res, next) {
  try {
    const assessment = await Assessment.findOne({ _id: req.params.id, deletedAt: null });
    if (!assessment) throw new AppError("Assessment was not found.", { code: "NOT_FOUND", statusCode: 404 });
    await assertAssessmentManager(req.user, assessment);
    assessment.status = "ARCHIVED";
    assessment.deletedAt = new Date();
    await assessment.save();
    await audit(req.user._id, "ASSESSMENT_DELETED", "Assessment", assessment._id);
    ok(res, "Assessment deleted successfully.", { id: assessment.id });
  } catch (error) { next(error); }
}

function isAttemptTimedOut(attempt, assessment, now = new Date()) {
  return Boolean(assessment.durationMinutes && now.getTime() - attempt.startedAt.getTime() >= assessment.durationMinutes * 60_000);
}

export async function startAttempt(req, res, next) {
  try {
    const assessment = await Assessment.findById(req.params.id);
    if (!assessment || assessment.status !== "PUBLISHED") throw new AppError("Assessment is not available.", { code: "ASSESSMENT_NOT_AVAILABLE", statusCode: 404 });
    const now = new Date();
    if ((assessment.availableFrom && now < assessment.availableFrom) || (assessment.availableUntil && now > assessment.availableUntil)) throw new AppError("Assessment is not currently available.", { code: "ASSESSMENT_NOT_AVAILABLE", statusCode: 403 });
    const enrollment = await checkEnrollmentAccess({ learnerId: req.user._id, courseId: assessment.courseId });
    const current = await Attempt.findOne({ learnerId: req.user._id, assessmentId: assessment.id, enrollmentId: enrollment.id, status: "IN_PROGRESS" });
    if (current && !isAttemptTimedOut(current, assessment, now)) return ok(res, "Assessment attempt resumed.", { attempt: current });
    if (current) { current.status = "TIMED_OUT"; current.submittedAt = now; await current.save(); }
    const count = await Attempt.countDocuments({ learnerId: req.user._id, assessmentId: assessment.id, enrollmentId: enrollment.id });
    if (count >= assessment.attemptLimit) throw new AppError("Assessment attempt limit reached.", { code: "ATTEMPT_LIMIT_REACHED", statusCode: 403 });
    const attempt = await Attempt.create({ assessmentId: assessment.id, learnerId: req.user._id, enrollmentId: enrollment.id });
    ok(res, "Assessment attempt started.", { attempt }, 201);
  } catch (error) { next(error); }
}

export async function saveAnswers(req, res, next) {
  try {
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt || !attempt.learnerId.equals(req.user._id) || attempt.status !== "IN_PROGRESS") throw new AppError("Active assessment attempt was not found.", { code: "NOT_FOUND", statusCode: 404 });
    const assessment = await Assessment.findById(attempt.assessmentId);
    if (isAttemptTimedOut(attempt, assessment)) throw new AppError("Time limit reached. Submit your saved answers.", { code: "TIME_LIMIT_EXCEEDED", statusCode: 409 });
    if (!Array.isArray(req.body.answers)) throw new AppError("Answers must be an array.", { code: "VALIDATION_ERROR", statusCode: 400 });
    const questions = await Question.find({ assessmentId: attempt.assessmentId }).select("_id");
    const ids = new Set(questions.map((question) => question.id));
    if (req.body.answers.some((answer) => !ids.has(String(answer.questionId)))) throw new AppError("An answer does not belong to this assessment.", { code: "VALIDATION_ERROR", statusCode: 400 });
    attempt.answers = req.body.answers.map((answer) => ({ questionId: answer.questionId, selectedOptionKey: answer.selectedOptionKey, selectedOptionKeys: Array.isArray(answer.selectedOptionKeys) ? answer.selectedOptionKeys : [], textResponse: answer.textResponse, markedForReview: Boolean(answer.markedForReview), savedAt: new Date() }));
    await attempt.save();
    ok(res, "Answers saved successfully.", { attempt });
  } catch (error) { next(error); }
}

export async function submitAttempt(req, res, next) {
  try {
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt || !attempt.learnerId.equals(req.user._id) || !["IN_PROGRESS", "TIMED_OUT"].includes(attempt.status)) throw new AppError("Active assessment attempt was not found.", { code: "NOT_FOUND", statusCode: 404 });
    const assessment = await Assessment.findById(attempt.assessmentId);
    const now = new Date();
    const timedOut = attempt.status === "TIMED_OUT" || isAttemptTimedOut(attempt, assessment, now);
    const questions = await Question.find({ assessmentId: assessment.id }).select("+correctOptionKey +correctOptionKeys");
    const answers = new Map(attempt.answers.map((answer) => [String(answer.questionId), answer]));
    let score = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let pendingReviewCount = 0;
    for (const question of questions) {
      const answer = answers.get(question.id);
      if (question.type === "DESCRIPTIVE") { if (answer?.textResponse?.trim()) pendingReviewCount += 1; else incorrectCount += 1; continue; }
      const expected = question.correctOptionKeys?.length ? [...question.correctOptionKeys].sort() : [question.correctOptionKey].filter(Boolean);
      const selected = answer?.selectedOptionKeys?.length ? [...answer.selectedOptionKeys].sort() : [answer?.selectedOptionKey].filter(Boolean);
      const isCorrect = expected.length === selected.length && expected.every((key, index) => key === selected[index]);
      if (isCorrect) { score += question.marks; correctCount += 1; } else incorrectCount += 1;
    }
    attempt.status = timedOut ? "TIMED_OUT" : "SUBMITTED";
    attempt.score = score;
    attempt.totalMarks = assessment.totalMarks;
    attempt.percentage = assessment.totalMarks ? Number(((score / assessment.totalMarks) * 100).toFixed(2)) : 0;
    attempt.result = pendingReviewCount ? undefined : score >= assessment.passingMarks ? "PASS" : "FAIL";
    attempt.correctCount = correctCount;
    attempt.incorrectCount = incorrectCount;
    attempt.pendingReviewCount = pendingReviewCount;
    attempt.submittedAt = now;
    attempt.timeTakenSeconds = Math.max(0, Math.round((now - attempt.startedAt) / 1000));
    await attempt.save();
    ok(res, "Assessment submitted successfully.", { attempt: assessment.showResults ? attempt : { id: attempt.id, status: attempt.status, resultsHidden: true } });
  } catch (error) { next(error); }
}

export async function listAttempts(req, res, next) {
  try {
    const filter = { status: { $in: ["SUBMITTED", "TIMED_OUT"] } };
    if (req.user.role === "LEARNER") filter.learnerId = req.user._id;
    if (req.query.learnerId && canManage.includes(req.user.role)) filter.learnerId = req.query.learnerId;
    const assessmentFilter = {};
    if (req.query.courseId) assessmentFilter.courseId = req.query.courseId;
    if (req.query.moduleId) assessmentFilter.moduleId = req.query.moduleId;
    if (req.query.assessmentId) assessmentFilter._id = req.query.assessmentId;
    if (req.user.role === "TRAINER") assessmentFilter.courseId = { ...(req.query.courseId ? { $eq: req.query.courseId } : {}), $in: await Course.find({ trainerIds: req.user._id }).distinct("_id") };
    const assessmentIds = await Assessment.find(assessmentFilter).distinct("_id");
    filter.assessmentId = { $in: assessmentIds };
    const { page, limit } = parsePagination(req.query);
    const [documents, total] = await Promise.all([
      Attempt.find(filter).populate("learnerId", "name email").populate({ path: "assessmentId", populate: [{ path: "courseId", select: "title" }, { path: "moduleId", select: "title" }] }).populate("enrollmentId", "startDate expiryDate").sort({ submittedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Attempt.countDocuments(filter),
    ]);
    const items = documents.map((document) => {
      const item = document.toObject();
      if (req.user.role === "LEARNER" && item.assessmentId?.showResults === false) {
        for (const key of ["score", "totalMarks", "percentage", "result", "correctCount", "incorrectCount", "pendingReviewCount", "answers"]) delete item[key];
      }
      return item;
    });
    ok(res, "Assessment attempts fetched successfully.", { items, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
}
export async function getAttemptResult(req, res, next) {
  try {
    const attempt = await Attempt.findOne({ _id: req.params.id, learnerId: req.user._id, status: { $in: ["SUBMITTED", "TIMED_OUT"] } })
      .populate({ path: "assessmentId", populate: [{ path: "courseId", select: "title" }, { path: "moduleId", select: "title" }] });
    if (!attempt) throw new AppError("Assessment result was not found.", { code: "NOT_FOUND", statusCode: 404 });
    const assessment = attempt.assessmentId;
    if (!assessment.showResults) return ok(res, "Assessment was submitted.", { resultsHidden: true, assessment: { title: assessment.title, courseId: assessment.courseId }, attempt: { status: attempt.status, submittedAt: attempt.submittedAt } });
    const questions = await Question.find({ assessmentId: assessment._id }).sort({ order: 1 }).select("+correctOptionKey +correctOptionKeys");
    ok(res, "Assessment result fetched successfully.", {
      resultsHidden: false,
      assessment: { _id: assessment._id, title: assessment.title, courseId: assessment.courseId, moduleId: assessment.moduleId, totalMarks: assessment.totalMarks, passingMarks: assessment.passingMarks, showResults: assessment.showResults },
      attempt,
      questions,
    });
  } catch (error) { next(error); }
}
