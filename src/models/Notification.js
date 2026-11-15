import mongoose from "mongoose";
const notificationSchema = new mongoose.Schema({ recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, type: { type: String, required: true, trim: true }, title: { type: String, required: true, trim: true }, message: { type: String, required: true, trim: true }, read: { type: Boolean, default: false, index: true }, metadata: mongoose.Schema.Types.Mixed }, { timestamps: true, versionKey: false });
notificationSchema.index({ recipientId: 1, createdAt: -1 });
export default mongoose.model("Notification", notificationSchema);
