export interface CoreRevisionRef {
  assetId: string;
  version: number;
}

export type CoreRevisionMap = Record<string, CoreRevisionRef>;

/** Additive catalog seam: never drops fields, only adds assetId/version. */
export function attachMediaCore<T extends { fileId?: string | null }>(
  items: readonly T[],
  revisions: CoreRevisionMap,
): Array<T & { assetId: string | null; version: number | null }> {
  return items.map((item) => {
    const ref = item.fileId ? revisions[item.fileId] : undefined;
    return {
      ...item,
      assetId: ref?.assetId ?? null,
      version: ref?.version ?? null,
    };
  });
}
