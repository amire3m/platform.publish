export interface CsvParseLimits {
  maxRows?: number;
  maxCols?: number;
}

const DEFAULT_MAX_ROWS = 10000;
const DEFAULT_MAX_COLS = 200;

export function parseCsv(text: string, limits?: CsvParseLimits): string[][] {
  const maxRows = limits?.maxRows ?? DEFAULT_MAX_ROWS;
  const maxCols = limits?.maxCols ?? DEFAULT_MAX_COLS;

  if (text === "" || text == null) return [];

  // Strip BOM
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Helper to push current field
  // We will handle line breaks when not inQuotes

  while (i < input.length) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          // escaped quote
          field += '"';
          i += 2;
          continue;
        } else {
          // end of quoted field
          inQuotes = false;
          i += 1;
          continue;
        }
      } else {
        // any char including \n \r inside quotes
        field += char;
        i += 1;
        continue;
      }
    } else {
      if (char === '"') {
        // start quoted field - only if field is empty (per RFC) but be lenient: treat as start
        if (field === "") {
          inQuotes = true;
          i += 1;
          continue;
        } else {
          // stray quote inside unquoted field – treat as literal?
          field += char;
          i += 1;
          continue;
        }
      } else if (char === ",") {
        row.push(field);
        field = "";
        // check col limit early? We'll check after row completes
        if (row.length > maxCols) {
          throw new Error(`CSV exceeds column limit ${maxCols}`);
        }
        i += 1;
        continue;
      } else if (char === "\r") {
        // CRLF or CR
        if (next === "\n") {
          // CRLF
          row.push(field);
          field = "";
          rows.push(row);
          if (rows.length > maxRows) throw new Error(`CSV exceeds row limit ${maxRows}`);
          if (row.length > maxCols) throw new Error(`CSV exceeds column limit ${maxCols}`);
          row = [];
          i += 2;
          continue;
        } else {
          // lone CR as newline
          row.push(field);
          field = "";
          rows.push(row);
          if (rows.length > maxRows) throw new Error(`CSV exceeds row limit ${maxRows}`);
          if (row.length > maxCols) throw new Error(`CSV exceeds column limit ${maxCols}`);
          row = [];
          i += 1;
          continue;
        }
      } else if (char === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        if (rows.length > maxRows) throw new Error(`CSV exceeds row limit ${maxRows}`);
        if (row.length > maxCols) throw new Error(`CSV exceeds column limit ${maxCols}`);
        row = [];
        i += 1;
        continue;
      } else {
        field += char;
        i += 1;
        continue;
      }
    }
  }

  // EOF handling
  // Push last field/row if any content or if trailing comma case
  // Distinguish: if input ends with newline, last row already pushed and field is empty + row empty
  // We have row and field remaining
  // If inQuotes still true at EOF, that's unterminated, but we treat field as is (or push)
  // RFC4180: trailing empty field needs handling: "a,b," should yield 3 fields.
  // Our loop already handles commas; at EOF we need to flush.

  // If we have any pending field or row not empty, push
  // Example: "a,b" -> row=["a"], field="b" => push field then row
  // "a,b," -> after comma, row=["a","b"], field="" then EOF => push field "" then row
  // "a,b\n" -> after newline, row pushed, row=[], field="" => at EOF row empty & field empty => don't push empty row
  if (field !== "" || row.length > 0 || inQuotes) {
    row.push(field);
    rows.push(row);
    if (rows.length > maxRows) throw new Error(`CSV exceeds row limit ${maxRows}`);
    if (row.length > maxCols) throw new Error(`CSV exceeds column limit ${maxCols}`);
  } else {
    // Edge: input ended with newline -> we already pushed; no extra row
    // But if input is like "" we already returned earlier
    // handle case where last line was empty line? e.g., "a,b\n\n" -> second newline produced row, but third? Our logic would
    // For empty line between, we push row with one empty field? Actually "a,b\n\n" -> after first newline push ["a","b"], next char \n then row.push("") -> [""] pushed, then EOF row empty -> no extra. That's okay.
  }

  // Finally, ensure each row's column count within limit already checked, but also check max rows
  if (rows.length > maxRows) throw new Error(`CSV exceeds row limit ${maxRows}`);

  return rows;
}
