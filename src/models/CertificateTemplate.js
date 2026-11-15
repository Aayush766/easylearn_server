import mongoose from "mongoose";

const certificateTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  style: { type: String, enum: ["CLASSIC", "MODERN", "BOTANICAL", "CUSTOM"], default: "CLASSIC" },
  primaryColor: { type: String, default: "#1d4ed8", match: /^#[0-9a-fA-F]{6}$/ },
  accentColor: { type: String, default: "#d4a63a", match: /^#[0-9a-fA-F]{6}$/ },
  backgroundImageUrl: { type: String, default: "", maxlength: 1000 },
  logoUrl: { type: String, default: "", maxlength: 1000 },
  signatureImageUrl: { type: String, default: "", maxlength: 1000 },
  organizationName: { type: String, default: "PRIME EASY LEARN", maxlength: 100 },
  certificateTitle: { type: String, default: "CERTIFICATE OF COMPLETION", maxlength: 120 },
  subtitle: { type: String, default: "THIS IS PROUDLY PRESENTED TO", maxlength: 160 },
  bodyText: { type: String, default: "for successfully mastering and completing the accredited program in", maxlength: 300 },
  signatureText: { type: String, default: "AUTHORIZED SIGNATURE", maxlength: 100 },
  borderStyle: { type: String, enum: ["DOUBLE", "SOLID", "DASHED", "NONE"], default: "DOUBLE" },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });

export default mongoose.model("CertificateTemplate", certificateTemplateSchema);
