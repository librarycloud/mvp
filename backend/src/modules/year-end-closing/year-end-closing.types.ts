import type { AuthRole } from "../auth/auth.types.js";
export interface YearEndActor { actorId: number; role:AuthRole; }
export interface YearEndInput { profitAccountId: number; }
