import type { AuthRole } from "../auth/auth.types.js";

export interface DimensionActor { actorId: number; role: AuthRole; }
export interface DimensionInput { code: string; name: string; enabled?: boolean; }
export interface DimensionMemberInput { code: string; name: string; enabled?: boolean; }
export interface DimensionRuleInput { accountId: number; dimensionId: number; required?: boolean; }
