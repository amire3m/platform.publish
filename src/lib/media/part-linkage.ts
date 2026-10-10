/**
 * Where a completed media-core upload lands on a content part.
 * Mirrors the content-room upload semantics: full video and plain covers
 * live in part slots; every other output kind lives in asset rows.
 */
export type PartLinkTarget = "part-file" | "part-cover" | "part-asset";

export function partLinkageFor(kind: string): PartLinkTarget {
  if (kind === "video") return "part-file";
  if (kind === "cover") return "part-cover";
  return "part-asset";
}
