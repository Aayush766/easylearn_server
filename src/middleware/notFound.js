import AppError from "../utils/AppError.js";

function notFound(req, res, next) {
  next(new AppError(`Route ${req.method} ${req.originalUrl} was not found.`, { code: "NOT_FOUND", statusCode: 404 }));
}

export default notFound;
