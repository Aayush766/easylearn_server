import { Router } from "express";
import { verifyCertificate } from "../controllers/learnerController.js";
const router = Router();
router.get("/verify/:code", verifyCertificate);
export default router;
