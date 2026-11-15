class AppError extends Error {
  constructor(message, { code = "INTERNAL_ERROR", statusCode = 500 } = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export default AppError;
