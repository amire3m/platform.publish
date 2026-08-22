import { customAlphabet } from "nanoid";
import { todayJalali } from "./date/jalali";

const legacySuffix = customAlphabet("0123456789", 6);
export const ANALYTICS_SNAPSHOT_ID_SUFFIX = {
  alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  length: 16,
} as const;
const analyticsSnapshotSuffix = customAlphabet(
  ANALYTICS_SNAPSHOT_ID_SUFFIX.alphabet,
  ANALYTICS_SNAPSHOT_ID_SUFFIX.length,
);

/** Generate spec-shaped human ids like CNT-1405-000001 / EVT-1405-000042. */
export function generateEntityId(
  prefix:
    | "CNT"
    | "EVT"
    | "ACC"
    | "USR"
    | "SNP"
    | "TPC"
    | "CRD"
    | "ANS"
    | "WPR"
    | "WDL"
    | "WPB"
    | "WTM"
    | "WEV"
    | "WNT"
    | "WIB",
): string {
  const { jy } = todayJalali();
  const suffix = prefix === "ANS" ? analyticsSnapshotSuffix() : legacySuffix();
  return `${prefix}-${jy}-${suffix}`;
}
