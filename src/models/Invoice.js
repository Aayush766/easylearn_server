import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, trim: true, maxlength: 80, unique: true, index: true },
  customer: { type: String, required: true, trim: true, maxlength: 180 },
  plan: { type: String, required: true, trim: true, maxlength: 120 },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
  paymentMethod: { type: String, enum: ["ONLINE", "BANK_TRANSFER", "CASH", "OTHER"], required: true },
  status: { type: String, enum: ["PAID", "PENDING", "FAILED", "REFUNDED"], default: "PENDING", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  deletedAt: { type: Date, default: null, index: true },
}, { timestamps: true, versionKey: false });

export default mongoose.model("Invoice", invoiceSchema);
