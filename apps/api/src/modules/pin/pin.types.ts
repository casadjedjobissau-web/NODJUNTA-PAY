export interface PinStatus {
  hasPin: boolean;
  locked: boolean;
  lockedUntil: string | null;
}

export type PinFailure =
  | { ok: false; reason: "not_set" }
  | { ok: false; reason: "locked"; lockedUntil: string }
  | { ok: false; reason: "invalid"; attemptsLeft: number; lockedUntil: string | null };

export type PinVerifyResult = { ok: true } | PinFailure;

export interface PinService {
  status(userId: string): Promise<PinStatus>;
  setInitial(userId: string, pin: string): Promise<void>;
  verify(userId: string, pin: string): Promise<PinVerifyResult>;
  change(userId: string, currentPin: string, newPin: string): Promise<PinVerifyResult>;
  reset(userId: string, newPin: string): Promise<void>;
}

export class PinError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = "PinError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface FailureResponse {
  httpStatus: number;
  body: {
    error: string;
    message: string;
    attemptsLeft?: number;
    lockedUntil?: string;
  };
}

export function describePinFailure(failure: PinFailure): FailureResponse {
  switch (failure.reason) {
    case "not_set":
      return {
        httpStatus: 403,
        body: { error: "pin_not_set", message: "Defina o seu PIN antes de movimentar dinheiro." },
      };
    case "locked":
      return {
        httpStatus: 429,
        body: {
          error: "pin_locked",
          message: "PIN bloqueado por tentativas falhadas. Tente mais tarde.",
          lockedUntil: failure.lockedUntil,
        },
      };
    case "invalid": {
      if (failure.attemptsLeft <= 0 && failure.lockedUntil !== null) {
        return {
          httpStatus: 429,
          body: {
            error: "pin_locked",
            message: "PIN incorreto. Foi bloqueado por tentativas falhadas. Tente mais tarde.",
            lockedUntil: failure.lockedUntil,
          },
        };
      }
      const left = failure.attemptsLeft;
      const text = left === 1 ? "Resta 1 tentativa." : `Restam ${left} tentativas.`;
      return {
        httpStatus: 403,
        body: { error: "invalid_pin", message: `PIN incorreto. ${text}`, attemptsLeft: left },
      };
    }
  }
}
