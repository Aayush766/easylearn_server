import mongoose from "mongoose";
const moduleSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, trim: true, maxlength: 3000 },
  order: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE" },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });
moduleSchema.index({ courseId: 1, order: 1 }, { unique: true });
export default mongoose.model("Module", moduleSchema);
