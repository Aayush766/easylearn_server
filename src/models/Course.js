import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({ publicId: String, url: String }, { _id: false });
const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", index: true },
  thumbnail: mediaSchema,
  displayOrder: { type: Number, default: 0, min: 0 },
  description: { type: String, trim: true, maxlength: 5000 },
  trainerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
  trainerAssignments: [{ trainerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, assignedAt: { type: Date, default: Date.now }, assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" } }],
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", index: true },
  completionRequiresPostPass: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });
export default mongoose.model("Course", courseSchema);
