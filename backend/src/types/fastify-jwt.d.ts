import "@fastify/jwt";
import type { AuthRole } from "../modules/auth/auth.types.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; jti: string; role: AuthRole; type: "access" | "refresh" };
    user: { sub: string; jti: string; role: AuthRole; type: "access" | "refresh" };
  }
}
