import { Router } from "express";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { getRoster, listAttendance, saveSession } from "../controllers/attendanceController.js";

const router = Router();
router.use(authenticate);
router.get("/", authorize("LEARNER", "TRAINER", "ADMIN", "SUPER_ADMIN"), listAttendance);
router.get("/roster", authorize("TRAINER", "ADMIN", "SUPER_ADMIN"), getRoster);
router.post("/sessions", authorize("TRAINER"), saveSession);
export default router;
