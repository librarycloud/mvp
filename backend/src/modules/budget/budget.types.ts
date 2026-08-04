import type { AuthRole } from "../auth/auth.types.js";

export interface BudgetActor { actorId: number; role: AuthRole; }
export interface BudgetLineInput { expenseType: string; department?: string; amount: string; }
export interface BudgetPlanInput { fiscalYear: number; name: string; status?: number; lines?: BudgetLineInput[]; }
export interface BudgetReservationInput { id: number; expenseDate: Date; expenseType: string; department?: string | null; amount: string | import("../../generated/prisma/client.js").Prisma.Decimal; }
