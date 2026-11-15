import mongoose from "mongoose";
const mediaSchema = new mongoose.Schema({ publicId: String, url: String }, { _id: false });
const contentSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Module", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 }, description: { type: String, trim: true, maxlength: 5000 },
  type: { type: String, enum: ["VIDEO", "PDF", "PPT", "OTHER"], required: true },
  file: { provider: { type: String, enum: ["CLOUDFLARE_STREAM", "CLOUDINARY", "EXTERNAL"] }, publicId: String, url: String },
  thumbnail: mediaSchema, cloudflareVideoId: String, durationSeconds: { type: Number, min: 0 },
  accessLevel: { type: String, enum: ["FREE", "ENROLLED"], default: "ENROLLED", index: true },
  addToNotes: { type: Boolean, default: false },
  order: { type: Number, required: true, min: 0 }, tags: [{ type: String, trim: true, maxlength: 50 }],
  language: { type: String, trim: true, maxlength: 40 }, downloadable: { type: Boolean, default: false },
  scheduledFor: { type: Date, default: null, index: true },
  status: { type: String, enum: ["DRAFT", "SCHEDULED", "PUBLISHED"], default: "DRAFT", index: true },
  deletedAt: { type: Date, default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });
contentSchema.index({ moduleId: 1, order: 1 }, { unique: true });
export default mongoose.model("Content", contentSchema);









