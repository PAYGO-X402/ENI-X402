import { parseUnits } from "viem";

export type DecimalString = string & { readonly __decimalString: unique symbol };

const DECIMAL_STRING_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function parseDecimalString(
  value: string,
  fieldName = "decimal value",
): DecimalString {
  const normalized = value.trim();
  if (!DECIMAL_STRING_PATTERN.test(normalized)) {
    throw new Error(
      `${fieldName} must be a plain decimal string like "0.001" or "42.5". Received: ${value}`,
    );
  }

  const [rawIntegerPart, rawFractionPart = ""] = normalized.split(".");
  const integerPart = rawIntegerPart.replace(/^0+(?=\d)/, "") || "0";
  const fractionPart = rawFractionPart.replace(/0+$/, "");

  return (
    fractionPart.length > 0
      ? `${integerPart}.${fractionPart}`
      : integerPart
  ) as DecimalString;
}

export function decimalToUnitAmount(
  value: DecimalString,
  decimals: number,
): string {
  return parseUnits(value, decimals).toString();
}
