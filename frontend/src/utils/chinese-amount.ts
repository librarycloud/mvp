/**
 * 将阿拉伯数字金额转换为中国财务规范的大写金额
 * 符合中国人民银行《支付结算办法》
 * @param amount 数字或字符串金额，例如 "100.50"、-500、"0"
 */
export function numberToChineseAmount(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "零元整";
  
  let numStr = String(amount).trim();
  if (!numStr || isNaN(Number(numStr))) return "零元整";

  const isNegative = numStr.startsWith("-");
  if (isNegative) {
    numStr = numStr.slice(1);
  }

  const num = Number(numStr);
  if (num === 0) return "零元整";

  const digits = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
  const radices = ["", "拾", "佰", "仟"];
  const bigRadices = ["", "万", "亿", "兆"];
  const decimals = ["角", "分"];

  const parts = numStr.split(".");
  const integerPart = parts[0] ?? "0";
  const decimalPart = (parts[1] ?? "").slice(0, 2);

  let chineseStr = "";

  // 处理整数部分
  if (Number(integerPart) > 0) {
    let zeroCount = 0;
    const len = integerPart.length;

    for (let i = 0; i < len; i++) {
      const char = integerPart[i]!;
      const digit = Number(char);
      const position = len - i - 1;
      const quotient = Math.floor(position / 4);
      const modulus = position % 4;

      if (digit === 0) {
        zeroCount++;
      } else {
        if (zeroCount > 0) {
          chineseStr += digits[0];
        }
        zeroCount = 0;
        chineseStr += digits[digit] + radices[modulus];
      }

      if (modulus === 0 && zeroCount < 4) {
        chineseStr += bigRadices[quotient];
      }
    }
    chineseStr += "元";
  }

  // 处理小数部分
  if (!decimalPart || (decimalPart === "0" || decimalPart === "00")) {
    chineseStr += "整";
  } else {
    const jiao = Number(decimalPart[0] ?? 0);
    const fen = Number(decimalPart[1] ?? 0);

    if (jiao === 0 && fen === 0) {
      chineseStr += "整";
    } else {
      if (jiao > 0) {
        chineseStr += digits[jiao] + decimals[0];
      } else if (Number(integerPart) > 0) {
        chineseStr += digits[0];
      }

      if (fen > 0) {
        chineseStr += digits[fen] + decimals[1];
      }
    }
  }

  return (isNegative ? "（红字）" : "") + chineseStr;
}
