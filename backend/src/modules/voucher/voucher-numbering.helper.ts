import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/errors/app-error.js";

export async function getNextVoucherNumber(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<{ sequenceNo: number; voucherNo: string }> {
  await tx.$executeRaw`INSERT IGNORE INTO voucher_sequences (fiscal_year,next_value,created_at,updated_at,deleted_at) VALUES (${year},1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL)`;
  const rows = await tx.$queryRaw<Array<{ next_value: number }>>`
    SELECT next_value FROM voucher_sequences WHERE fiscal_year = ${year} FOR UPDATE`;
  const sequenceNo = Number(rows[0]?.next_value);
  if (!Number.isSafeInteger(sequenceNo) || sequenceNo < 1 || sequenceNo > 999999) {
    throw new AppError("VOUCHER_SEQUENCE_EXHAUSTED", `${year}年度凭证序号不可用`, 409);
  }
  await tx.voucherSequence.update({ where: { fiscalYear: year }, data: { nextValue: sequenceNo + 1 } });
  return { sequenceNo, voucherNo: `${year}-${String(sequenceNo).padStart(6, "0")}` };
}

export async function allocateVoucherNumbers(
  tx: Prisma.TransactionClient,
  year: number,
  count: number,
): Promise<Array<{ sequenceNo: number; voucherNo: string }>> {
  if (count <= 0) return [];
  await tx.$executeRaw`INSERT IGNORE INTO voucher_sequences (fiscal_year,next_value,created_at,updated_at,deleted_at) VALUES (${year},1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL)`;
  const rows = await tx.$queryRaw<Array<{ next_value: number }>>`
    SELECT next_value FROM voucher_sequences WHERE fiscal_year = ${year} FOR UPDATE`;
  const startSeq = Number(rows[0]?.next_value);
  if (!Number.isSafeInteger(startSeq) || startSeq < 1 || startSeq + count - 1 > 999999) {
    throw new AppError("VOUCHER_SEQUENCE_EXHAUSTED", `${year}年度凭证序号不可用或溢出`, 409);
  }
  await tx.voucherSequence.update({ where: { fiscalYear: year }, data: { nextValue: startSeq + count } });
  return Array.from({ length: count }, (_, i) => {
    const seq = startSeq + i;
    return { sequenceNo: seq, voucherNo: `${year}-${String(seq).padStart(6, "0")}` };
  });
}

