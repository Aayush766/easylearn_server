import { Router } from "express";
import { authenticate, authorize } from "../middleware/authenticate.js";
import * as controller from "../controllers/courseController.js";
const router = Router(); const admins = ["ADMIN", "SUPER_ADMIN"];
router.use(authenticate);
router.get("/modules", authorize("TRAINER", ...admins), controller.listAllModules); router.post("/modules", authorize("TRAINER", ...admins), controller.createModuleFromBody); router.delete("/modules/:id", authorize("TRAINER", ...admins), controller.deleteModule);
router.get("/categories", controller.listCategories); router.post("/categories", authorize(...admins), controller.createCategory); router.patch("/categories/:id", authorize(...admins), controller.updateCategory); router.delete("/categories/:id", authorize(...admins), controller.deleteCategory);
router.get("/courses", controller.listCourses); router.get("/catalog", authorize("LEARNER"), controller.courseCatalog); router.post("/courses", authorize(...admins), controller.createCourse); router.get("/courses/:id", controller.getCourse); router.patch("/courses/display-order", authorize("TRAINER"), controller.updateTrainerCourseOrder); router.patch("/courses/:id/trainer-details", authorize("TRAINER"), controller.updateTrainerCourseDetails); router.patch("/courses/:id", authorize(...admins), controller.updateCourse); router.delete("/courses/:id", authorize(...admins), controller.archiveCourse);
router.post("/courses/:courseId/trainers", authorize(...admins), controller.assignTrainer); router.delete("/courses/:courseId/trainers/:trainerId", authorize(...admins), controller.unassignTrainer);
router.get("/courses/:courseId/modules", controller.listModules); router.post("/courses/:courseId/modules", authorize("TRAINER", ...admins), controller.createModule); router.patch("/modules/:id", authorize("TRAINER", ...admins), controller.updateModule);
router.get("/content", controller.listContent); router.post("/content", authorize("TRAINER", ...admins), controller.createContent); router.patch("/content/:id", authorize("TRAINER", ...admins), controller.updateContent); router.delete("/content/:id", authorize("TRAINER", ...admins), controller.deleteContent); router.post("/content/:id/publish", authorize("TRAINER", ...admins), controller.publishContent);
export default router;







