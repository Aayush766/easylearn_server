import User from "../models/User.js";
import { env } from "../config/env.js";
export async function bootstrapSuperAdmin() {
  const { name, email, password } = env.superAdmin;
  if (!email || !password) return;
  const exists = await User.exists({ role: "SUPER_ADMIN" });
  if (exists) return;
  const user = new User({ name, email, role: "SUPER_ADMIN", status: "ACTIVE", passwordHash: "pending" });
  await user.setPassword(password);
  await user.save();
  console.info(JSON.stringify({ event: "super_admin_bootstrapped", email: user.email }));
}
