import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

test("admin, trainer and learner API flow", { skip: !process.env.TEST_MONGODB_URI }, async () => {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env" });
  process.env.NODE_ENV = "test";
  const originalMongoUri = process.env.MONGODB_URI;
  const testMongoUri = new URL(process.env.TEST_MONGODB_URI);
  const testDatabase = decodeURIComponent(testMongoUri.pathname.replace(/^\//, ""));
  assert.match(testDatabase, /^pel_flow_test(?:_[a-f0-9]+)?$/i, "TEST_MONGODB_URI must point to a dedicated pel_flow_test database");
  assert.ok(testDatabase.length <= 38, "TEST_MONGODB_URI database name must fit MongoDB limits");
  assert.notEqual(process.env.TEST_MONGODB_URI, originalMongoUri, "integration tests must not use the configured application database");
  process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;

  const [{ default: mongoose }, { connectDatabase, disconnectDatabase }, { default: app }, { bootstrapSuperAdmin }, { env }] = await Promise.all([
    import("mongoose"), import("../src/config/db.js"), import("../src/app.js"), import("../src/services/bootstrapSuperAdmin.js"), import("../src/config/env.js"),
  ]);

  let server;
  let cloudinaryPublicId;
  try {
    await connectDatabase();
    await bootstrapSuperAdmin();
    server = app.listen(0);
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const call = async (path, { token, method = "GET", body, cookie } = {}) => {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      const result = await response.json();
      return { status: response.status, result, cookie: response.headers.get("set-cookie") };
    };
    const data = (response, status = 200) => {
      assert.equal(response.status, status, JSON.stringify(response.result));
      return response.result.data;
    };

    const adminLogin = data(await call("/api/auth/login", { method: "POST", body: { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD, role: "SUPER_ADMIN" } }));
    assert.ok(adminLogin.accessToken);
    const admin = adminLogin.accessToken;
    const me = data(await call("/api/auth/me", { token: admin }));
    assert.equal(me.user.role, "SUPER_ADMIN");
    const invoice = data(await call("/api/admin/billing/invoices", { token: admin, method: "POST", body: { invoiceNumber: `FLOW-${Date.now()}`, customer: "Flow Customer", plan: "Annual", amount: 100, date: new Date().toISOString(), paymentMethod: "OTHER", status: "PENDING" } }), 201).invoice;
    assert.equal(data(await call(`/api/admin/billing/invoices/${invoice._id}`, { token: admin, method: "PATCH", body: { status: "PAID" } })).invoice.status, "PAID");
    assert.ok(data(await call("/api/admin/billing/invoices", { token: admin })).items.some((row) => row._id === invoice._id));

    const category = data(await call("/api/categories", { token: admin, method: "POST", body: { name: "Flow Test", slug: `flow-test-${Date.now()}`, status: "ACTIVE" } }), 201).category;
    const categoryList = data(await call("/api/categories", { token: admin }));
    assert.ok(categoryList.items.some((item) => item._id === category._id));
    data(await call(`/api/categories/${category._id}`, { token: admin, method: "PATCH", body: { description: "updated" } }));

    const learner = data(await call("/api/users", { token: admin, method: "POST", body: { name: "Flow Learner", email: `learner-${Date.now()}@example.test`, role: "LEARNER", password: "Learner-password-123!" } }), 201).user;
    const trainer = data(await call("/api/users", { token: admin, method: "POST", body: { name: "Flow Trainer", email: `trainer-${Date.now()}@example.test`, role: "TRAINER", password: "Trainer-password-123!" } }), 201).user;

    const course = data(await call("/api/courses", { token: admin, method: "POST", body: { title: "Flow Test Course", slug: `flow-test-course-${Date.now()}`, categoryId: category._id, description: "API flow test", displayOrder: 0, status: "PUBLISHED" } }), 201).course;
    data(await call(`/api/courses/${course._id}/trainers`, { token: admin, method: "POST", body: { trainerId: trainer._id } }));
    const trainerLogin = data(await call("/api/auth/login", { method: "POST", body: { email: trainer.email, password: "Trainer-password-123!", role: "TRAINER" } }));
    const trainerToken = trainerLogin.accessToken;
    assert.ok(data(await call(`/api/courses/${course._id}/modules`, { token: trainerToken } )).modules);

    const module = data(await call(`/api/courses/${course._id}/modules`, { token: trainerToken, method: "POST", body: { title: "Module 1", order: 0, status: "ACTIVE" } }), 201).module;
    const content = data(await call("/api/content", { token: trainerToken, method: "POST", body: { courseId: course._id, moduleId: module._id, title: "Lesson 1", type: "VIDEO", order: 0, file: { provider: "EXTERNAL", url: "https://media.example.test/lesson.mp4" }, accessLevel: "ENROLLED" } }), 201).content;
    const uploadSignature = data(await call("/api/uploads/signature", { token: trainerToken, method: "POST", body: {} }));
    assert.ok(uploadSignature.signature);
    assert.match(uploadSignature.folder, /trainer\//);
    if (process.env.TEST_CLOUDINARY_UPLOADS === "true") {
      assert.ok(env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret, "Cloudinary credentials must be configured for upload round-trip testing");
      const form = new FormData();
      form.set("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64")], { type: "image/png" }), "flow-test.png");
      for (const key of ["apiKey", "timestamp", "folder", "allowedFormats", "publicId", "overwrite", "signature"]) {
        const formKey = { apiKey: "api_key", allowedFormats: "allowed_formats", publicId: "public_id" }[key] || key;
        form.set(formKey, String(uploadSignature[key]));
      }
      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${uploadSignature.cloudName}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
      const uploaded = await uploadResponse.json();
      cloudinaryPublicId = uploaded.public_id;
      assert.ok(uploadResponse.ok && uploaded.secure_url && uploaded.public_id, `Cloudinary upload failed with status ${uploadResponse.status}`);
    }
    data(await call(`/api/content/${content._id}/publish`, { token: trainerToken, method: "POST", body: {} }));
    assert.equal(data(await call(`/api/content/${content._id}`, { token: trainerToken, method: "PATCH", body: { title: "Updated lesson" } })).content.title, "Updated lesson");
    assert.equal((await call(`/api/content/${content._id}`, { token: trainerToken, method: "PATCH", body: { status: "PUBLISHED" } })).status, 400);

    const startDate = new Date(Date.now() - 60_000).toISOString();
    const expiryDate = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const enrollment = data(await call("/api/enrollments", { token: admin, method: "POST", body: { learnerId: learner._id, courseId: course._id, startDate, expiryDate } }), 201).enrollment;
    assert.equal(enrollment.status, "ACTIVE");

    const assessment = data(await call("/api/assessments", { token: trainerToken, method: "POST", body: { courseId: course._id, moduleId: module._id, title: "Flow Quiz", type: "POST", totalMarks: 1, passingMarks: 1, attemptLimit: 2, durationMinutes: 10 } }), 201).assessment;
    data(await call(`/api/assessments/${assessment._id}/questions`, { token: trainerToken, method: "POST", body: { question: "2 + 2?", type: "MCQ", options: [{ key: "A", text: "3" }, { key: "B", text: "4" }], correctOptionKey: "B", marks: 1, order: 0 } }), 201);
    data(await call(`/api/assessments/${assessment._id}/publish`, { token: trainerToken, method: "POST", body: {} }));

    const learnerLoginResponse = await call("/api/auth/login", { method: "POST", body: { email: learner.email, password: "Learner-password-123!", role: "LEARNER" } });
    const learnerLogin = data(learnerLoginResponse);
    const learnerToken = learnerLogin.accessToken;
    const learnerCookie = learnerLoginResponse.cookie?.split(";")[0];
    const profileUpdate = data(await call(`/api/users/${learner._id}`, { token: learnerToken, method: "PATCH", body: { name: "Updated Flow Learner", phone: "+971500000000", profile: { bio: "Flow test" }, password: "Learner-password-456!" } }));
    assert.equal(profileUpdate.user.name, "Updated Flow Learner");
    assert.equal((await call("/api/auth/login", { method: "POST", body: { email: learner.email, password: "Learner-password-123!", role: "LEARNER" } })).status, 401);
    assert.ok(data(await call("/api/auth/login", { method: "POST", body: { email: learner.email, password: "Learner-password-456!", role: "LEARNER" } })).accessToken);
    assert.ok(data(await call("/api/learner/my-courses", { token: learnerToken })).courses.length);
    assert.ok(data(await call("/api/learner/dashboard", { token: learnerToken })).summary.enrolledCourses >= 1);
    assert.equal(data(await call(`/api/learner/courses/${course._id}/player`, { token: learnerToken })).content.length, 1);
    assert.ok(data(await call(`/api/courses/${course._id}/modules`, { token: learnerToken })).modules.length);
    const ticket = data(await call("/api/learner/support", { token: learnerToken, method: "POST", body: { category: "COURSE", subject: "Flow help request", description: "Please help with this test lesson." } }), 201).ticket;
    const listedTickets = data(await call("/api/learner/support", { token: admin }));
    assert.ok(listedTickets.items.some((row) => row._id === ticket._id));
    data(await call(`/api/learner/support/${ticket._id}`, { token: admin, method: "PATCH", body: { status: "RESOLVED" } }));
    assert.equal((await call(`/api/learner/support/${ticket._id}`, { token: trainerToken, method: "PATCH", body: { status: "CLOSED" } })).status, 403);
    data(await call("/api/learner/messages", { token: learnerToken, method: "POST", body: { recipientId: trainer._id, body: "Test learner message." } }), 201);
    assert.ok(data(await call("/api/learner/messages", { token: trainerToken, })).items.length);
    data(await call("/api/admin/notifications", { token: admin, method: "POST", body: { audience: "LEARNERS", title: "Test notice", body: "Test announcement." } }), 201);
    const notifications = data(await call("/api/learner/notifications", { token: learnerToken }));
    const notification = notifications.items.find((row) => row.title === "Test notice");
    assert.ok(notification);
    data(await call(`/api/learner/notifications/${notification._id}/read`, { token: learnerToken, method: "PATCH", body: {} }));
    assert.ok(data(await call("/api/admin/notifications", { token: admin })).items.some((row) => row.metadata?.title === "Test notice"));
    assert.equal((await call("/api/admin/notifications", { token: trainerToken })).status, 403);
    assert.ok(data(await call("/api/admin/audit-logs", { token: admin })).items.some((row) => row.action === "NOTIFICATION_SENT"));
    const attempt = data(await call(`/api/assessments/${assessment._id}/start`, { token: learnerToken, method: "POST", body: {} }), 201).attempt;
    data(await call(`/api/attempts/${attempt._id}/answers`, { token: learnerToken, method: "PUT", body: { answers: [{ questionId: (await call(`/api/assessments/${assessment._id}`, { token: learnerToken })).result.data.questions[0]._id, selectedOptionKey: "B" }] } }));
    const submitted = data(await call(`/api/attempts/${attempt._id}/submit`, { token: learnerToken, method: "POST", body: {} }));
    assert.equal(submitted.attempt.result, "PASS");
    assert.equal(data(await call(`/api/attempts/${attempt._id}/result`, { token: learnerToken })).attempt.result, "PASS");
    data(await call("/api/learner/progress", { token: learnerToken, method: "POST", body: { contentId: content._id, progressPercent: 100, watchedSeconds: 60, completed: true } }));

    const certificate = data(await call("/api/admin/certificates/generate", { token: admin, method: "POST", body: { enrollmentId: enrollment._id } }), 201).certificate;
    assert.equal(data(await call(`/api/certificates/verify/${certificate.verificationCode}`)).certificate.status, "VALID");
    assert.ok(data(await call("/api/learner/certificates", { token: learnerToken })).items.some((item) => item._id === certificate._id));
    assert.ok(data(await call("/api/admin/reports", { token: admin, })).rows);
    assert.ok(data(await call("/api/admin/summary", { token: admin })).learners >= 1);
    assert.ok(data(await call("/api/admin/trainer/activity", { token: trainerToken })).items.length);
    assert.equal((await call("/api/admin/summary", { token: learnerToken })).status, 403);
    assert.equal((await call("/api/courses", {})).status, 401);
    assert.ok(data(await call("/api/auth/refresh", { method: "POST", cookie: learnerCookie })).accessToken);

    data(await call(`/api/admin/certificates/${certificate._id}`, { token: admin, method: "DELETE" }));
    assert.equal((await call(`/api/content/${content._id}`, { token: learnerToken, method: "DELETE" })).status, 403);
    data(await call(`/api/content/${content._id}`, { token: trainerToken, method: "DELETE" }));
    assert.equal((await call(`/api/learner/content/${content._id}`, { token: learnerToken })).status, 404);
    assert.equal((await call("/api/admin/certificates/generate", { token: admin, method: "POST", body: { enrollmentId: enrollment._id } })).status, 422);
    const replacementContent = data(await call("/api/content", { token: trainerToken, method: "POST", body: { courseId: course._id, moduleId: module._id, title: "Replacement lesson", type: "PDF", order: 0, file: { provider: "EXTERNAL", url: "https://media.example.test/replacement.pdf" }, accessLevel: "ENROLLED" } }), 201).content;
    data(await call(`/api/content/${replacementContent._id}`, { token: trainerToken, method: "DELETE" }));
    data(await call(`/api/enrollments/${enrollment._id}`, { token: admin, method: "DELETE" }));
    data(await call(`/api/assessments/${assessment._id}`, { token: trainerToken, method: "DELETE" }));
    data(await call(`/api/modules/${module._id}`, { token: trainerToken, method: "DELETE" }));
    data(await call(`/api/courses/${course._id}`, { token: admin, method: "DELETE" }));
    data(await call(`/api/categories/${category._id}`, { token: admin, method: "DELETE" }));
    data(await call(`/api/users/${learner._id}`, { token: admin, method: "DELETE" }));
    data(await call(`/api/users/${trainer._id}`, { token: admin, method: "DELETE" }));
    data(await call(`/api/admin/billing/invoices/${invoice._id}`, { token: admin, method: "DELETE" }));
    const logout = await call("/api/auth/logout", { method: "POST", cookie: learnerCookie });
    data(logout);
    assert.match(logout.cookie || "", /refreshToken=;/);
    assert.equal((await call("/api/auth/refresh", { method: "POST" })).status, 401);
  } finally {
    try {
      if (cloudinaryPublicId && env.cloudinary.apiSecret) {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = createHash("sha1").update(`public_id=${cloudinaryPublicId}&timestamp=${timestamp}${env.cloudinary.apiSecret}`).digest("hex");
        const form = new FormData();
        form.set("public_id", cloudinaryPublicId); form.set("timestamp", String(timestamp)); form.set("api_key", env.cloudinary.apiKey); form.set("signature", signature);
        const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/image/destroy`, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
        const result = await response.json();
        assert.ok(response.ok && result.result === "ok", "Temporary Cloudinary upload could not be removed.");
      }
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      try { if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase(); }
      finally { await disconnectDatabase(); }
    }
  }
});
