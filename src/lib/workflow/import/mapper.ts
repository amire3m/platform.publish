import {
  isTitleHeader,
  normalizeDeliverableName,
  normalizeWorkflowTitle,
  parseHeaderForPlatform,
} from "./normalization";

export type MappedPublicationStatus =
  | "waiting_for_production"
  | "ready"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "do_not_publish";

export interface UnknownCell {
  kind: "unknown";
  raw: string;
  row: number;
  column: number;
}

export interface PublicationMapping {
  status: MappedPublicationStatus;
  terminalOwner?: "imported" | "manual" | "automatic" | null;
  produced?: boolean;
}

export interface ProductionMapping {
  productionStatus: "not_started" | "in_progress" | "ready_for_review" | "changes_requested" | "ready" | "cancelled";
  reason?: string;
}

export type CellMapping = PublicationMapping | ProductionMapping | UnknownCell;

export interface MapCellContext {
  kind: string; // "publication" | "production" | etc
  platform?: string;
  deliverableName?: string;
  deliverableNormalized?: string;
  row?: number;
  column?: number;
}

export function mapCell(raw: string, ctx: MapCellContext): CellMapping | UnknownCell {
  const trimmed = (raw ?? "").trim().normalize("NFC");
  const row = ctx.row ?? 0;
  const column = ctx.column ?? 0;

  if (trimmed === "") {
    if (ctx.kind === "publication") {
      return { status: "waiting_for_production" } as PublicationMapping;
    }
    return { productionStatus: "not_started" } as ProductionMapping;
  }

  // Normalize value for comparison (preserve? we trimmed)
  // Persian values exact match
  if (trimmed === "کامل") {
    if (ctx.kind === "publication") {
      return { status: "published", terminalOwner: "imported" } as PublicationMapping;
    }
    // production/thumbnail
    return { productionStatus: "ready" } as ProductionMapping;
  }

  if (trimmed === "منتشر نشود") {
    return { status: "do_not_publish", terminalOwner: "manual" } as unknown as PublicationMapping;
  }

  if (trimmed === "اصلاح شود") {
    // Spec: maps to production changes_requested
    // For both production and publication contexts we return productionStatus
    // This satisfies test expecting productionStatus even when kind is publication but deliverableName present
    return { productionStatus: "changes_requested", reason: "واردشده از شیت" } as ProductionMapping;
  }

  // Unknown
  return { kind: "unknown", raw, row, column } as UnknownCell;
}

// Suggest column mapping

export interface MappedColumn {
  index: number;
  header: string;
  role: "title" | "publication" | "production" | "unknown";
  deliverableName?: string;
  deliverableNormalized?: string;
  platform?: "telegram" | "youtube" | "instagram";
}

export interface DeliverableGroup {
  normalizedName: string;
  originalNames: string[];
  platforms: ("telegram" | "youtube" | "instagram")[];
  columns: number[];
}

export interface ColumnMapping {
  columns: MappedColumn[];
  deliverables: DeliverableGroup[];
  titleColumnIndex: number | null;
}

export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const columns: MappedColumn[] = [];
  const groups = new Map<string, DeliverableGroup>();
  let titleColumnIndex: number | null = null;

  headers.forEach((h, idx) => {
    const header = h ?? "";
    if (header.trim() === "") {
      columns.push({ index: idx, header, role: "unknown" });
      return;
    }

    // Check title heuristic – first title-like header becomes title column, limited to one
    if (titleColumnIndex === null && isTitleHeader(header)) {
      titleColumnIndex = idx;
      columns.push({ index: idx, header, role: "title" });
      return;
    }

    // Also treat first column as title if no title found and idx===0 and not platform-suffixed?
    // But prefer explicit detection; fallback later

    const parsed = parseHeaderForPlatform(header);
    if (parsed.platform) {
      // This is a publication column with deliverable grouping
      const normalized = parsed.normalizedBase || normalizeDeliverableName(header);
      // group
      let group = groups.get(normalized);
      if (!group) {
        group = { normalizedName: normalized, originalNames: [], platforms: [], columns: [] };
        groups.set(normalized, group);
      }
      if (!group.originalNames.includes(parsed.base)) group.originalNames.push(parsed.base);
      if (!group.platforms.includes(parsed.platform)) group.platforms.push(parsed.platform);
      group.columns.push(idx);

      columns.push({
        index: idx,
        header,
        role: "publication",
        deliverableName: parsed.base,
        deliverableNormalized: normalized,
        platform: parsed.platform,
      });
      return;
    }

    // No platform suffix: treat as production/deliverable column (e.g., "کاور" or generic)
    // Could be production column like deliverable name without platform
    // Check if header looks like deliverable
    const normalized = normalizeDeliverableName(header);
    // Avoid duplicating title: if we haven't found title yet and this is first column, treat as title
    if (titleColumnIndex === null && idx === 0) {
      titleColumnIndex = idx;
      columns.push({ index: idx, header, role: "title" });
      return;
    }

    // Otherwise it's a deliverable production column
    let group = groups.get(normalized);
    if (!group) {
      group = { normalizedName: normalized, originalNames: [], platforms: [], columns: [] };
      groups.set(normalized, group);
    }
    if (!group.originalNames.includes(header.trim())) group.originalNames.push(header.trim());
    group.columns.push(idx);

    columns.push({
      index: idx,
      header,
      role: "production",
      deliverableName: header.trim(),
      deliverableNormalized: normalized,
    });
  });

  // fallback title if none found and at least one column exists
  if (titleColumnIndex === null && headers.length > 0) {
    // pick first non-empty as title if not already assigned
    const firstIdx = columns.findIndex((c) => c.role !== "unknown");
    if (firstIdx !== -1 && columns[firstIdx].role !== "title") {
      // Reassign
      const col = columns[firstIdx];
      // Remove from groups if it was production group
      if (col.deliverableNormalized) {
        const g = groups.get(col.deliverableNormalized);
        if (g) {
          g.columns = g.columns.filter((c) => c !== col.index);
          if (g.columns.length === 0) groups.delete(col.deliverableNormalized);
        }
      }
      col.role = "title";
      col.deliverableName = undefined;
      col.deliverableNormalized = undefined;
      col.platform = undefined;
      titleColumnIndex = col.index;
    } else if (columns.length > 0 && columns[0].role === "unknown" && headers[0].trim() !== "") {
      // empty fallback
      columns[0].role = "title";
      titleColumnIndex = 0;
    }
  }

  return {
    columns,
    deliverables: Array.from(groups.values()),
    titleColumnIndex,
  };
}

// Map sheet rows

export interface MappedCell {
  raw: string;
  mapped: CellMapping | UnknownCell;
  column: MappedColumn;
  rowIndex: number;
}

export interface MappedRow {
  rowIndex: number; // 0-based data row index (excluding header)
  originalIndex: number; // absolute row index in sheet
  title: string;
  normalizedTitle: string;
  cells: MappedCell[];
}

export interface MapSheetResult {
  rows: MappedRow[];
  unknowns: UnknownCell[];
  columns: MappedColumn[];
  titleColumnIndex: number | null;
}

export function mapSheetRows(rows: string[][], mapping: ColumnMapping): MapSheetResult {
  if (!rows || rows.length === 0) return { rows: [], unknowns: [], columns: mapping.columns, titleColumnIndex: mapping.titleColumnIndex };
  const headerRow = rows[0];
  // Use mapping as provided; but if rows header mismatched, still use mapping
  const dataRows = rows.slice(1);
  const resultRows: MappedRow[] = [];
  const unknowns: UnknownCell[] = [];

  dataRows.forEach((row, dataIdx) => {
    const originalIndex = dataIdx + 1;
    let title = "";
    let normalizedTitle = "";
    if (mapping.titleColumnIndex !== null && mapping.titleColumnIndex < row.length) {
      title = row[mapping.titleColumnIndex] ?? "";
      normalizedTitle = normalizeWorkflowTitle(title);
    } else if (row.length > 0) {
      title = row[0] ?? "";
      normalizedTitle = normalizeWorkflowTitle(title);
    }

    const cells: MappedCell[] = [];
    mapping.columns.forEach((col) => {
      if (col.role === "title" || col.role === "unknown") return;
      const raw = col.index < row.length ? (row[col.index] ?? "") : "";
      const ctx: MapCellContext = {
        kind: col.role, // "publication" or "production"
        platform: col.platform,
        deliverableName: col.deliverableName,
        deliverableNormalized: col.deliverableNormalized,
        row: originalIndex,
        column: col.index,
      };
      const mapped = mapCell(raw, ctx);
      if ((mapped as UnknownCell).kind === "unknown") {
        unknowns.push(mapped as UnknownCell);
      }
      cells.push({ raw, mapped, column: col, rowIndex: originalIndex });
    });

    resultRows.push({
      rowIndex: dataIdx,
      originalIndex,
      title,
      normalizedTitle,
      cells,
    });
  });

  return { rows: resultRows, unknowns, columns: mapping.columns, titleColumnIndex: mapping.titleColumnIndex };
}
