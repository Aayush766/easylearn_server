import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
  description: { type: String, trim: true, maxlength: 1000 },
  image: { publicId: String, url: String },
  status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE", index: true },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });
export default mongoose.model("Category", categorySchema);
