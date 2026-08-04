export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (message = "认证失败") =>
  new AppError("UNAUTHORIZED", message, 401);

export class PeriodClosedException extends AppError {
  constructor(details?: unknown) {
    super("PERIOD_CLOSED", "当前会计期间已关账，请先反关账。", 409, details);
  }
}

export class VoucherStatusException extends AppError {
  constructor(message: string, details?: unknown) {
    super("VOUCHER_STATUS_INVALID", message, 409, details);
  }
}
