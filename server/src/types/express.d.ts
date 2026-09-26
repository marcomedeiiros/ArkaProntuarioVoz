import type { Principal } from "../middleware/auth";

declare global {
  namespace Express {
    interface Request {
      auth?: Principal;
    }
  }
}

export {};
