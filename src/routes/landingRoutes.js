import { Router } from "express";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { getLanding, updateLanding } from "../controllers/landingController.js";
const router = Router();
router.get("/", getLanding);
router.put("/", authenticate, authorize("SUPER_ADMIN"), updateLanding);
export default router;
