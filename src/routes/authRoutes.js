import { Router } from "express";
import { changePassword, disableTwoFactor, enableTwoFactor, getCurrentUser, loginUser, logoutUser, refreshToken, setupTwoFactor } from "../controllers/authController.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();
router.post("/login", loginUser);
router.post("/refresh", refreshToken);
router.post("/logout", logoutUser);
router.get("/me", authenticate, getCurrentUser);
router.post("/change-password", authenticate, changePassword);
router.post("/2fa/setup", authenticate, setupTwoFactor);
router.post("/2fa/enable", authenticate, enableTwoFactor);
router.post("/2fa/disable", authenticate, disableTwoFactor);
export default router;
