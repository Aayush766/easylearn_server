import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import errorHandler from "./middleware/errorHandler.js";
import notFound from "./middleware/notFound.js";
import healthRoutes from "./routes/healthRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";
import assessmentRoutes from "./routes/assessmentRoutes.js";
import attemptRoutes from "./routes/attemptRoutes.js";
import learnerRoutes from "./routes/learnerRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import landingRoutes from "./routes/landingRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import { rateLimit } from "./middleware/rateLimit.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ credentials: true, origin: env.clientOrigins }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/api", healthRoutes);
app.use("/api/landing", landingRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/auth", rateLimit({ max: 10, windowMs: 15 * 60 * 1000 }), authRoutes);
app.use("/api", rateLimit());
app.use("/api", courseRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/assessments", assessmentRoutes);
app.use("/api/attempts", attemptRoutes);
app.use("/api/learner", learnerRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;




















