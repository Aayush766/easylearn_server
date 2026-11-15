import mongoose from "mongoose";
const optionSchema = new mongoose.Schema({ key: { type: String, required: true, trim: true }, text: { type: String, required: true, trim: true } }, { _id: false });
const questionSchema = new mongoose.Schema({
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assessment", required: true, index: true },
  question: { type: String, required: true, trim: true, maxlength: 5000 }, type: { type: String, enum: ["MCQ", "MULTI_SELECT", "TRUE_FALSE", "DESCRIPTIVE"], default: "MCQ" },
  options: { type: [optionSchema], default: [] },
  correctOptionKey: { type: String, trim: true, select: false }, correctOptionKeys: { type: [{ type: String, trim: true }], default: [], select: false }, marks: { type: Number, required: true, min: 1 },
  explanation: { type: String, trim: true, maxlength: 5000 }, order: { type: Number, required: true, min: 0 },
}, { timestamps: true, versionKey: false });
questionSchema.index({ assessmentId: 1, order: 1 }, { unique: true });
questionSchema.pre("validate", function validateAnswers() {
  if (this.type === "DESCRIPTIVE") return;
  if (!this.options || this.options.length < 2) this.invalidate("options", "Choice questions need at least two answer options.");
  const answers = this.correctOptionKeys?.length ? this.correctOptionKeys : this.correctOptionKey ? [this.correctOptionKey] : [];
  if (!answers.length) this.invalidate("correctOptionKeys", "Select at least one correct answer.");
  if (this.type !== "MULTI_SELECT" && answers.length !== 1) this.invalidate("correctOptionKeys", "This question type needs exactly one correct answer.");
  if (answers.some((key) => !this.options?.some((option) => option.key === key))) this.invalidate("correctOptionKeys", "Correct answers must match the supplied options.");
});
export default mongoose.model("Question", questionSchema);
