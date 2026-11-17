import mongoose from "mongoose";
const landingContentSchema = new mongoose.Schema({ key: { type: String, unique: true, default: "main" }, content: { type: mongoose.Schema.Types.Mixed, default: {} }, draftContent: { type: mongoose.Schema.Types.Mixed, default: {} }, status: { type: String, enum: ["DRAFT", "PUBLISHED"], default: "PUBLISHED" } }, { timestamps: true, versionKey: false });
export default mongoose.model("LandingContent", landingContentSchema);
