import mongoose from "mongoose";
const auditSchema = new mongoose.Schema({ actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }, action: { type: String, required: true, index: true }, entityType: { type: String, required: true }, entityId: mongoose.Schema.Types.ObjectId, metadata: mongoose.Schema.Types.Mixed }, { timestamps: true, versionKey: false });
export default mongoose.model("AuditLog", auditSchema);
