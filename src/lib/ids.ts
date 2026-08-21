import { customAlphabet } from "nanoid";
import { todayJalali } from "./date/jalali";

const alphaNumeric = customAlphabet("0123456789", 6);

/** Generate spec-shaped human ids like CNT-1405-000001 / EVT-1405-000042. */
export function generateEntityId(prefix: "CNT" | "EVT" | "ACC" | "USR" | "SNP" | "TPC" | "CRD"): string {
  const { jy } = todayJalali();
  return `${prefix}-${jy}-${alphaNumeric()}`;
}
