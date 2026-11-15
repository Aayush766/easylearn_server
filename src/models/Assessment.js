import mongoose from "mongoose";
const assessmentSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Module", index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 }, description: { type: String, trim: true, maxlength: 5000 },
  type: { type: String, enum: ["PRE", "POST", "MODULE"], required: true, index: true },
  totalMarks: { type: Number, required: true, min: 1 }, passingMarks: { type: Number, required: true, min: 0 },
  durationMinutes: { type: Number, min: 1 }, attemptLimit: { type: Number, required: true, min: 1, default: 1 },
  availableFrom: Date, availableUntil: Date, shuffleQuestions: { type: Boolean, default: false }, shuffleOptions: { type: Boolean, default: false },
  showResults: { type: Boolean, default: true }, instructions: { type: String, trim: true, maxlength: 5000 },
  draftQuestions: { type: [mongoose.Schema.Types.Mixed], default: [], select: false },
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });
assessmentSchema.pre("validate", function validScores() { if (this.passingMarks > this.totalMarks) this.invalidate("passingMarks", "Passing marks cannot exceed total marks."); });
export default mongoose.model("Assessment", assessmentSchema);
