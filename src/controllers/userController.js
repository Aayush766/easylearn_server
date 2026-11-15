import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { list, ok } from "../utils/api.js";
import { audit } from "../services/auditService.js";

const allowedRoles = ["ADMIN", "TRAINER", "LEARNER"];
const adminRoles = ["ADMIN", "SUPER_ADMIN"];

export async function listUsers(req, res, next) {
  try {
    const filter = { deletedAt: null };
    if (req.query.role) filter.role = req.query.role;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const search = String(req.query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }];
    }
    ok(res, "Users fetched successfully.", await list(User, filter, req.query));
  } catch (error) { next(error); }
}

export async function createUser(req, res, next) {
  try {
    const { password, role = "LEARNER", ...data } = req.body;
    if (!["SUPER_ADMIN"].includes(req.user.role) && role === "ADMIN") {
      throw new AppError("Only a super admin can create admin accounts.", { code: "FORBIDDEN", statusCode: 403 });
    }
    if (!allowedRoles.includes(role) || typeof password !== "string" || password.length < 8) {
      throw new AppError("Provide a valid role and password of at least 8 characters.", { code: "VALIDATION_ERROR", statusCode: 400 });
    }
    const user = new User({ ...data, role, passwordHash: "pending" });
    await user.setPassword(password);
    await user.save();
    ok(res, "User created successfully.", { user: user.toSafeJSON() }, 201);
  } catch (error) { next(error); }
}

export async function updateUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select("+passwordHash");
    if (!user) throw new AppError("User was not found.", { code: "NOT_FOUND", statusCode: 404 });
    const isSuperAdmin = req.user.role === "SUPER_ADMIN";
    const isAdmin = adminRoles.includes(req.user.role);
    const isSelf = user._id.equals(req.user._id);

    if (!isAdmin && !isSelf) throw new AppError("You do not have permission for this user.", { code: "FORBIDDEN", statusCode: 403 });
    if (user.role === "SUPER_ADMIN" && !isSuperAdmin) throw new AppError("Only a super admin can manage this account.", { code: "FORBIDDEN", statusCode: 403 });
    if (isAdmin && !isSuperAdmin && user.role === "ADMIN") throw new AppError("Only a super admin can manage admin accounts.", { code: "FORBIDDEN", statusCode: 403 });

    const fields = ["name", "phone", "gender", "specialization", "profileImage", "profile", "notificationPreferences"];
    if (isSuperAdmin && !isSelf) fields.push("status");
    if (isSuperAdmin && req.body.role !== undefined) {
      if (!allowedRoles.includes(req.body.role)) throw new AppError("The requested role is not assignable.", { code: "VALIDATION_ERROR", statusCode: 400 });
      user.role = req.body.role;
    }
    for (const key of fields) if (req.body[key] !== undefined) user[key] = req.body[key];
    if (req.body.password !== undefined) {
      if ((!isAdmin && !isSelf) || (isAdmin && !isSuperAdmin && user.role === "ADMIN")) throw new AppError("You cannot change this account's password.", { code: "FORBIDDEN", statusCode: 403 });
      if (typeof req.body.password !== "string" || req.body.password.length < 8) throw new AppError("Password must be at least 8 characters.", { code: "VALIDATION_ERROR", statusCode: 400 });
      await user.setPassword(req.body.password);
    }
    await user.save();
    ok(res, "User updated successfully.", { user: user.toSafeJSON() });
  } catch (error) { next(error); }
}

export async function deleteUser(req, res, next) {
  try {
    const user = await User.findOne({ _id: req.params.id, deletedAt: null });
    if (!user) throw new AppError("User was not found.", { code: "NOT_FOUND", statusCode: 404 });
    if (user._id.equals(req.user._id)) throw new AppError("You cannot delete your own account.", { code: "FORBIDDEN", statusCode: 403 });
    if (user.role === "SUPER_ADMIN" || (user.role === "ADMIN" && req.user.role !== "SUPER_ADMIN")) {
      throw new AppError("Only a super admin can delete admin accounts.", { code: "FORBIDDEN", statusCode: 403 });
    }
    user.status = "BLOCKED";
    user.deletedAt = new Date();
    await user.save();
    await audit(req.user._id, "USER_DELETED", "User", user._id, { role: user.role });
    ok(res, "User deleted successfully.", { id: user.id });
  } catch (error) { next(error); }
}
