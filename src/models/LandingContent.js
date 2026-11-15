import mongoose from "mongoose";
const landingContentSchema = new mongoose.Schema({ key: { type: String, unique: true, default: "main" }, content: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true, versionKey: false });
export default mongoose.model("LandingContent", landingContentSchema);
