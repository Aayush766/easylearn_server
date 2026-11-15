import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/config/db.js";
import User from "../src/models/User.js";

async function resetSuperAdmin() {
  if (!env.mongoUri) throw new Error("MONGODB_URI is missing from server/.env.");
  if (!env.superAdmin.email || !env.superAdmin.password) {
    throw new Error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in server/.env.");
  }

  await connectDatabase();
  const email = env.superAdmin.email.trim().toLowerCase();
  let user = await User.findOne({ email }).select("+passwordHash");

  if (!user) {
    user = new User({
      name: env.superAdmin.name,
      email,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      passwordHash: "pending",
    });
  } else {
    user.name = env.superAdmin.name;
    user.role = "SUPER_ADMIN";
    user.status = "ACTIVE";
  }

  await user.setPassword(env.superAdmin.password);
  await user.save();
  console.info(`Super-admin credentials reset for ${user.email}.`);
}

resetSuperAdmin()
  .catch((error) => {
    console.error(`Could not reset super admin: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
    await mongoose.disconnect().catch(() => {});
  });
