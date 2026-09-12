export interface CsvRowData {
  customerName?: string;
  company?: string;
  phone?: string;
  email?: string;
  location?: string;
  source?: string;
  product?: string;
  priority?: string;
  expectedValue?: string;
  remarks?: string;
  assignedTo?: string;
}

export interface ParsedCsvResult {
  headers: string[];
  rows: {
    rowNumber: number;
    data: CsvRowData;
    raw: Record<string, string>;
  }[];
}

const HEADER_ALIASES: Record<string, keyof CsvRowData> = {
  // Customer Name
  customername: 'customerName',
  customer: 'customerName',
  clientname: 'customerName',
  client: 'customerName',
  contactname: 'customerName',
  contactperson: 'customerName',
  name: 'customerName',

  // Company
  company: 'company',
  companyname: 'company',
  organization: 'company',
  organisation: 'company',
  firm: 'company',
  businessname: 'company',

  // Phone
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  mobilenumber: 'phone',
  contactnumber: 'phone',
  telephone: 'phone',
  cell: 'phone',

  // Email
  email: 'email',
  emailaddress: 'email',
  mail: 'email',

  // Location
  location: 'location',
  city: 'location',
  address: 'location',
  place: 'location',

  // Source
  source: 'source',
  leadsource: 'source',
  enquirysource: 'source',
  channel: 'source',

  // Product
  product: 'product',
  productname: 'product',
  service: 'product',
  item: 'product',
  requirement: 'product',

  // Priority
  priority: 'priority',
  urgency: 'priority',

  // Expected Value
  expectedvalue: 'expectedValue',
  value: 'expectedValue',
  dealvalue: 'expectedValue',
  amount: 'expectedValue',
  budget: 'expectedValue',
  estimatedvalue: 'expectedValue',

  // Remarks
  remarks: 'remarks',
  remark: 'remarks',
  notes: 'remarks',
  note: 'remarks',
  comments: 'remarks',
  comment: 'remarks',
  description: 'remarks',

  // Assigned To
  assignedto: 'assignedTo',
  assignee: 'assignedTo',
  assignedemployee: 'assignedTo',
  assignedemail: 'assignedTo',
  assignedrep: 'assignedTo',
  salesrep: 'assignedTo',
  owner: 'assignedTo',
};

/**
 * Normalizes header string for alias lookup.
 * Removes spaces, hyphens, underscores and converts to lowercase.
 */
export const normalizeHeaderKey = (header: string): string => {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Neutralizes CSV/Formula Injection attacks.
 * If the string begins with '=', '+', '-', '@', '\t', or '\r' (after leading whitespace trimming),
 * it is prefixed with a single quote (').
 * This prevents spreadsheet software (Excel, Calc, Google Sheets) from executing dangerous
 * formula payloads (e.g. =cmd|'/c calc'!A0) if exported back to CSV.
 */
export function sanitizeCsvField(value?: string | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = String(value);
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (/^[=+\-@\t\r]/.test(raw) || /^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Parses raw CSV string into a 2D array of string values following RFC 4180.
 * Handles embedded quotes, escaped quotes (""), newlines inside quotes, and UTF-8 BOM.
 */
export function parseRawCsv(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;

  // Strip BOM if present
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      } else {
        insideQuotes = !insideQuotes;
        i++;
        continue;
      }
    }

    if (!insideQuotes && char === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    if (!insideQuotes && (char === '\r' || char === '\n')) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      // Only keep rows that have at least one non-empty field
      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  // Handle trailing field and row
  currentRow.push(currentField.trim());
  if (currentRow.some((field) => field.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parses CSV text and maps each row to a structured CsvRowData object using fuzzy header aliases.
 */
export function parseCsv(content: string): ParsedCsvResult {
  const rawRows = parseRawCsv(content);
  if (rawRows.length === 0 || !rawRows[0]) {
    return { headers: [], rows: [] };
  }

  const rawHeaders: string[] = rawRows[0];
  const fieldMapping: { index: number; targetField: keyof CsvRowData; originalHeader: string }[] = [];

  for (let idx = 0; idx < rawHeaders.length; idx++) {
    const rawHeader = rawHeaders[idx];
    if (rawHeader === undefined) continue;
    const normalized = normalizeHeaderKey(rawHeader);
    const matchedField = HEADER_ALIASES[normalized];
    if (matchedField) {
      fieldMapping.push({
        index: idx,
        targetField: matchedField,
        originalHeader: rawHeader,
      });
    }
  }

  const parsedRows: ParsedCsvResult['rows'] = [];

  // Data rows start from physical line 2 (1-indexed)
  for (let r = 1; r < rawRows.length; r++) {
    const rowCells = rawRows[r];
    if (!rowCells) continue;
    const data: CsvRowData = {};
    const raw: Record<string, string> = {};

    for (let c = 0; c < rawHeaders.length; c++) {
      const headerKey = rawHeaders[c];
      if (headerKey !== undefined) {
        raw[headerKey] = rowCells[c] ?? '';
      }
    }

    for (const mapping of fieldMapping) {
      const cellVal = rowCells[mapping.index];
      if (cellVal !== undefined && cellVal !== '') {
        data[mapping.targetField] = cellVal;
      }
    }

    parsedRows.push({
      rowNumber: r + 1, // Row number in spreadsheet (Row 1 is header, Row 2 is first data row)
      data,
      raw,
    });
  }

  return {
    headers: rawHeaders,
    rows: parsedRows,
  };
}
