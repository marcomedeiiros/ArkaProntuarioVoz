import type { Actor } from "../use-cases/policy";

declare global {
  namespace Express {
    interface Request {
      auth?: Actor;
    }
  }
}

export {};
