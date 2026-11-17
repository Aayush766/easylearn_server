import { Router } from "express";
import { authenticate, authorize } from "../middleware/authenticate.js";
import { getLanding, getLandingForAdmin, updateLanding } from "../controllers/landingController.js";
const router = Router();
router.get("/", getLanding);
router.get("/manage", authenticate, authorize("SUPER_ADMIN"), getLandingForAdmin);
router.put("/", authenticate, authorize("SUPER_ADMIN"), updateLanding);
export default router;
