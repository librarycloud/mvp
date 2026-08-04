import type { AuthRole } from "../auth/auth.types.js";
export interface DepreciationActor { actorId: number; role:AuthRole; }
export interface DepreciationAccounts { expenseAccountId?: number; accumulatedDepreciationAccountId: number; }
