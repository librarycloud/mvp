import type { AuthRole } from "../auth/auth.types.js";
export interface SalaryActor { actorId: number; role: AuthRole; }
export interface EmployeeInput { employeeNo:string; name:string; idNumber?:string; department?:string; position?:string; bankName?:string; bankAccount?:string; joinDate?:string; baseSalary:string; socialInsurance?:string; housingFund?:string; status?:number; }
export interface SalaryItemInput { code:string; name:string; category:"BONUS"|"ALLOWANCE"|"DEDUCTION"|"SOCIAL_INSURANCE"|"HOUSING_FUND"; defaultAmount:string; sortOrder?:number; enabled?:boolean; remark?:string; }
export interface SalaryAccounts { expenseAccountId: number; payableAccountId: number; }
export interface SalaryOverride { employeeNo:string; baseSalary?:string|undefined; bonus?:string|undefined; allowance?:string|undefined; deduction?:string|undefined; socialInsurance?:string|undefined; housingFund?:string|undefined; individualIncomeTax?:string|undefined; }
