import AuditLog from "../models/AuditLog.js";
export const audit = (actorId, action, entityType, entityId, metadata = {}) => AuditLog.create({ actorId, action, entityType, entityId, metadata });
