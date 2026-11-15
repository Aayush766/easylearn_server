import bcrypt from "bcryptjs";
import mongoose from "mongoose";

export const USER_ROLES = ["SUPER_ADMIN", "ADMIN", "TRAINER", "LEARNER"];
export const USER_STATUSES = ["ACTIVE", "BLOCKED"];

const userSchema = new mongoose.Schema(
  {
    name: { trim: true, type: String, required: true, maxlength: 120 },
    email: { trim: true, lowercase: true, type: String, required: true, unique: true, index: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    phone: { trim: true, type: String, maxlength: 30 },
    gender: { trim: true, type: String, maxlength: 40 },
    specialization: { trim: true, type: String, maxlength: 160 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: "LEARNER", index: true },
    profileImage: { publicId: String, url: String },
    profile: { bio: { type: String, trim: true, maxlength: 2000 }, location: { type: String, trim: true, maxlength: 120 }, address: { type: String, trim: true, maxlength: 500 }, dateOfBirth: Date },
    notificationPreferences: { email: { type: Boolean, default: true }, inApp: { type: Boolean, default: true } },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    twoFactorPendingSecret: { type: String, select: false },
    status: { type: String, enum: USER_STATUSES, default: "ACTIVE", index: true },
    lastLoginAt: Date,
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false },
);

userSchema.pre("validate", function normalizeEmail() {
  if (this.email) this.email = this.email.trim().toLowerCase();
});

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
};

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const user = this.toObject();
  delete user.passwordHash;
  delete user.twoFactorSecret;
  delete user.twoFactorPendingSecret;
  return user;
};

export default mongoose.model("User", userSchema);
