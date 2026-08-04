import { Prisma } from "../../generated/prisma/client.js";

export type BalanceDirection = "DEBIT" | "CREDIT" | null;

export interface LedgerBalance {
  direction: BalanceDirection;
  amount: string;
}

export function calculateBalance(netDebit: Prisma.Decimal): LedgerBalance {
  if (netDebit.isZero()) return { direction: null, amount: "0" };
  return netDebit.greaterThan(0)
    ? { direction: "DEBIT", amount: netDebit.toString() }
    : { direction: "CREDIT", amount: netDebit.abs().toString() };
}
