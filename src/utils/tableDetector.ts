/**
 * Table Detection Module
 *
 * Based on pdfmd's approach with three detection strategies:
 * 1. Bordered tables (pipe characters) - highest confidence
 * 2. ASCII tables (whitespace-aligned columns)
 * 3. Vertical run tables (multi-block column detection)
 *
 * Uses comprehensive scoring based on cell content classification.
 */

export interface TableCell {
  text: string;
  colSpan?: number;
  rowSpan?: number;
}

export interface TableRow {
  cells: TableCell[];
  isHeader?: boolean;
}

export interface DetectedTable {
  rows: TableRow[];
  columnAlignments: ('left' | 'center' | 'right')[];
  confidence: number;
  startLine: number;
  endLine: number;
  detectionType: 'bordered' | 'ascii' | 'vertical';
}

export interface GridProfile {
  nRows: number;
  nCols: number;
  nonEmptyCells: number;
  shortTokenCells: number;
  numericCells: number;
  sentenceCells: number;
  avgLen: number;
  maxLen: number;
  score: number;
  density: number;
}

interface TextLine {
  text: string;
  y: number;
  x: number;
  width: number;
  fontSize: number;
}

// =============================================================================
// Cell Content Classification (from pdfmd)
// =============================================================================

/**
 * Check if cell is a short token (strong table signal)
 * Short tokens: ≤24 chars, no spaces, alphanumeric or numeric
 */
function cellIsShortToken(text: string): boolean {
  const s = text.trim();
  if (!s || s.length > 24) return false;
  if (s.includes(' ')) return false;

  // Strip common wrappers
  const sClean = s.replace(/^[()[\]{}%$€£+\-]+|[()[\]{}%$€£+\-]+$/g, '');
  if (!sClean) return false;

  // Pure digits or decimals
  if (/^\d+$/.test(sClean)) return true;
  if (/^\d*\.\d+$/.test(sClean)) return true;

  // Alphanumeric identifiers (like "A1", "Row2", "Total")
  if (/^[a-zA-Z0-9]+$/.test(sClean)) return true;

  return false;
}

/**
 * Check if cell contains numeric value (strong table signal)
 */
function cellIsNumeric(text: string): boolean {
  const s = text.trim().replace(/,/g, '');
  if (!s) return false;

  // Handle currency symbols
  const stripped = s.replace(/^[$€£¥₹]/, '').replace(/[$€£¥₹]$/, '');

  // Handle percentages and decimals
  const sClean = stripped.replace('.', '').replace('%', '');
  if (/^\d+$/.test(sClean)) return true;

  // Handle negative numbers
  if (sClean.startsWith('-') || sClean.startsWith('(')) {
    const inner = sClean.replace(/^[(\-]/, '').replace(/\)$/, '');
    if (/^\d+$/.test(inner.replace('.', ''))) return true;
  }

  return false;
}

/**
 * Check if cell is a sentence (negative table signal)
 * Sentences: ≥5 words, ends with sentence punctuation
 */
function cellIsSentence(text: string): boolean {
  const s = text.trim();
  if (!s) return false;

  const words = s.split(/\s+/);
  if (words.length < 5) return false;

  // Must end with sentence punctuation
  if (!/[.!?…]+$/.test(s)) return false;

  return true;
}

/**
 * Check if cell contains prose-like text (strong negative table signal)
 * This catches truncated sentences that don't end with punctuation
 * (common when two-column layouts are split)
 */
function cellIsProseFragment(text: string): boolean {
  const s = text.trim();
  if (!s) return false;

  // Long text is likely prose
  if (s.length > 60) return true;

  const words = s.split(/\s+/);

  // Multiple words with decent average length
  if (words.length >= 4 && s.length > 40) {
    // Check for common English prose words
    const proseWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
      'from', 'that', 'this', 'and', 'or', 'but', 'we', 'it', 'as', 'which'];

    const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
    const proseWordCount = lowerWords.filter(w => proseWords.includes(w)).length;

    // If 15%+ are common prose words, likely prose
    if (proseWordCount >= words.length * 0.15) return true;
  }

  // Check for sentence-like patterns even without ending punctuation
  // e.g., "Figure 2(a) shows the structure of the stacked"
  if (words.length >= 5 && /^[A-Z]/.test(s)) {
    // Starts with capital, has multiple words - likely prose fragment
    const avgWordLen = s.replace(/\s/g, '').length / words.length;
    if (avgWordLen >= 3.5) return true;  // Tables often have short tokens
  }

  return false;
}

/**
 * Check if a line looks like a list item
 */
function isListLikeLine(text: string): boolean {
  const s = text.trim();
  if (!s) return false;

  // Bullet markers
  if (/^[-•◦*]\s/.test(s)) return true;

  // Numbered or lettered lists
  if (/^(\d+|[A-Za-z])([.)])\s+/.test(s)) return true;

  return false;
}

/**
 * Check if lines look like code (false positive filter)
 */
function isCodeLikeBlock(lines: string[]): boolean {
  const CODE_SYMBOLS = new Set('{}[]();<>/=*+-'.split(''));
  const texts = lines.map(l => l.trim()).filter(Boolean);
  if (!texts.length) return false;

  let suspicious = 0;
  for (const t of texts) {
    const lower = t.toLowerCase();

    // Programming keywords
    if (/^(def |class |for |while |if |import |const |let |var |function )/.test(lower)) {
      suspicious++;
      continue;
    }

    // Type annotations
    if (t.includes(' -> ') || t.includes(': ') && t.includes('=')) {
      suspicious++;
      continue;
    }

    // High symbol density
    const nonSpace = t.replace(/\s/g, '').split('');
    if (nonSpace.length > 0) {
      const codeRatio = nonSpace.filter(c => CODE_SYMBOLS.has(c)).length / nonSpace.length;
      if (codeRatio >= 0.35) suspicious++;
    }
  }

  return suspicious >= Math.max(2, texts.length / 2);
}

// =============================================================================
// Grid Profiling and Scoring (from pdfmd)
// =============================================================================

/**
 * Profile a grid and calculate its table-likelihood score
 */
function profileGrid(grid: string[][]): GridProfile {
  const nRows = grid.length;
  const nCols = nRows > 0 ? Math.max(...grid.map(r => r.length)) : 0;

  let nonEmpty = 0;
  let shortTokens = 0;
  let numeric = 0;
  let sentences = 0;
  let proseFragments = 0;  // NEW: count prose-like fragments
  let totalLen = 0;
  let maxLen = 0;

  for (const row of grid) {
    for (const cell of row) {
      const text = cell.trim();
      if (text) {
        nonEmpty++;
        totalLen += text.length;
        maxLen = Math.max(maxLen, text.length);

        if (cellIsShortToken(text)) shortTokens++;
        if (cellIsNumeric(text)) numeric++;
        if (cellIsSentence(text)) sentences++;
        if (cellIsProseFragment(text)) proseFragments++;  // NEW
      }
    }
  }

  const totalCells = nRows * nCols;
  const density = totalCells > 0 ? nonEmpty / totalCells : 0;
  const avgLen = nonEmpty > 0 ? totalLen / nonEmpty : 0;

  // Calculate score (from pdfmd)
  let score = 0.0;

  // Base score from dimensions
  score += 1.0 * nRows;
  score += 0.8 * nCols;

  if (nonEmpty > 0) {
    // Reward tabular content types (short tokens are STRONG signal)
    score += 3.0 * (shortTokens / nonEmpty);
    score += 2.0 * (numeric / nonEmpty);

    // Penalize sentence-heavy content (full sentences)
    const sentenceRatio = sentences / nonEmpty;
    if (sentenceRatio > 0.8) {
      score -= 4.0 * sentenceRatio;
    } else if (sentenceRatio > 0.4) {
      score -= 2.0 * sentenceRatio;
    }

    // NEW: Penalize prose fragments (catches truncated sentences from two-column layouts)
    // This is CRITICAL for avoiding false positives on academic papers
    const proseFragmentRatio = proseFragments / nonEmpty;
    if (proseFragmentRatio > 0.5) {
      score -= 6.0 * proseFragmentRatio;  // Strong penalty
    } else if (proseFragmentRatio > 0.3) {
      score -= 3.0 * proseFragmentRatio;
    } else if (proseFragmentRatio > 0.15) {
      score -= 1.5 * proseFragmentRatio;
    }

    // Combined prose check: sentences OR prose fragments
    const totalProseRatio = Math.max(sentenceRatio, proseFragmentRatio);
    if (totalProseRatio > 0.6 && shortTokens + numeric < nonEmpty * 0.3) {
      // Mostly prose with few table-like cells - heavy penalty
      score -= 5.0;
    }
  }

  // Penalize long cells (suggests paragraphs)
  if (avgLen > 80) {
    score -= 4.0;
  } else if (avgLen > 50) {
    score -= 2.0;
  }

  // Penalize very long max cell (single cell with paragraph)
  if (maxLen > 100) {
    score -= 2.0;
  }

  // Bonus for substantial tables (but NOT if prose-heavy)
  if (nRows >= 4 && nCols >= 3 && proseFragments < nonEmpty * 0.3) {
    score += 2.0;
  }

  // Bonus for consistent column structure
  const colLengths = grid.map(row => row.length);
  if (new Set(colLengths).size === 1) {
    score += 1.5;
  }

  // Bonus for good density
  if (density >= 0.6) {
    score += 1.0;
  }

  return {
    nRows,
    nCols,
    nonEmptyCells: nonEmpty,
    shortTokenCells: shortTokens,
    numericCells: numeric,
    sentenceCells: sentences,
    avgLen,
    maxLen,
    score,
    density,
  };
}

/**
 * Check if a grid passes minimum profile requirements
 */
function gridPassesProfile(prof: GridProfile): boolean {
  if (prof.nRows < 2 || prof.nCols < 2) return false;
  if (prof.nonEmptyCells === 0) return false;

  // Require minimum cell density
  if (prof.density < 0.25) return false;

  // STRICT: Reject if average cell length is too long (prose, not tables)
  if (prof.avgLen > 60) {
    // Only allow if we have VERY strong tabular signals
    const tabularRatio = (prof.shortTokenCells + prof.numericCells) / prof.nonEmptyCells;
    if (tabularRatio < 0.5) return false;
  }

  // STRICT: Reject grids with many long cells
  if (prof.maxLen > 80 && prof.avgLen > 40) {
    const tabularRatio = (prof.shortTokenCells + prof.numericCells) / prof.nonEmptyCells;
    if (tabularRatio < 0.4) return false;
  }

  // Sentence-heavy content check (stricter threshold: 40% instead of 60%)
  if (prof.sentenceCells >= 0.4 * prof.nonEmptyCells) {
    // Only allow with STRONG tabular signals (not just dimension)
    const hasStrongStructure = (
      prof.numericCells >= 0.2 * prof.nonEmptyCells ||
      prof.shortTokenCells >= 0.3 * prof.nonEmptyCells
    );
    if (!hasStrongStructure) return false;
  }

  // Tables should have some tokens or numbers
  if (prof.shortTokenCells < 0.15 * prof.nonEmptyCells && prof.numericCells === 0) {
    // Be stricter - require more structure
    if (prof.nRows < 4 || prof.nCols < 3) return false;
    // And check that cells aren't too long
    if (prof.avgLen > 30) return false;
  }

  // Score threshold (raised from 1.0 to 2.0 for stricter filtering)
  if (prof.score < 2.0) return false;

  return true;
}

// =============================================================================
// Pre-filtering (from pdfmd)
// =============================================================================

/**
 * Quick filter to skip blocks that are obviously not tables
 */
function blockIsObviouslyNonTable(lines: TextLine[]): boolean {
  const texts = lines.map(l => l.text);
  if (texts.length < 2) return true;

  // Short blocks without multi-column structure
  if (texts.length <= 3 && texts.every(t => t.trim().length <= 40)) {
    const hasMultiCol = texts.some(t => splitCells(t).length >= 2);
    if (!hasMultiCol) return true;
  }

  // High concentration of list markers
  const listLike = texts.filter(t => isListLikeLine(t)).length;
  if (listLike >= Math.max(2, 0.8 * texts.length)) return true;

  // Nearly all lines start with bullets
  const bulletChars = new Set('•◦-*'.split(''));
  const bulletStarters = texts.filter(t => {
    const first = t.trim()[0];
    return first && bulletChars.has(first);
  }).length;
  if (bulletStarters >= texts.length * 0.9) return true;

  // Check for code-like content
  if (isCodeLikeBlock(texts)) return true;

  return false;
}

// =============================================================================
// Cell Splitting (from pdfmd)
// =============================================================================

const CELL_SPLIT_CONSERVATIVE = /[ \t]{3,}/;
const CELL_SPLIT_RELAXED = /[ \t]{2,}/;

/**
 * Split text into cells based on whitespace
 * Tries 3+ spaces first (conservative), falls back to 2+ spaces
 */
function splitCells(text: string): string[] {
  const s = text.trimEnd();
  if (!s) return [''];

  // Try conservative split first (3+ spaces)
  let cells = s.split(CELL_SPLIT_CONSERVATIVE);
  if (cells.length >= 2) return cells;

  // Fall back to relaxed split (2+ spaces)
  return s.split(CELL_SPLIT_RELAXED);
}

/**
 * Get most common value from array of numbers
 */
function mostCommonInt(arr: number[]): [number, number] {
  const counts = new Map<number, number>();
  for (const n of arr) {
    counts.set(n, (counts.get(n) || 0) + 1);
  }

  let maxCount = 0;
  let maxVal = 0;
  for (const [val, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxVal = val;
    }
  }

  return [maxVal, maxCount];
}

// =============================================================================
// Detection Strategies
// =============================================================================

/**
 * Main entry point for table detection
 */
export function detectTables(lines: TextLine[], pageWidth: number): DetectedTable[] {
  const tables: DetectedTable[] = [];

  // Pre-filter
  if (blockIsObviouslyNonTable(lines)) {
    return tables;
  }

  // Strategy 1: Detect bordered tables (pipes/ASCII borders) - highest priority
  const borderedTables = detectBorderedTables(lines);
  tables.push(...borderedTables);

  // Strategy 2: Detect ASCII whitespace-aligned tables
  const asciiTables = detectAsciiTables(lines, pageWidth);
  for (const table of asciiTables) {
    if (!overlapsWithExisting(table, tables)) {
      tables.push(table);
    }
  }

  // Strategy 3: Detect vertical run tables (columnar data)
  const verticalTables = detectVerticalRunTables(lines, pageWidth);
  for (const table of verticalTables) {
    if (!overlapsWithExisting(table, tables)) {
      tables.push(table);
    }
  }

  return tables.sort((a, b) => a.startLine - b.startLine);
}

/**
 * Check if a table overlaps with any existing detected tables
 */
function overlapsWithExisting(table: DetectedTable, existing: DetectedTable[]): boolean {
  for (const other of existing) {
    if (table.startLine <= other.endLine && table.endLine >= other.startLine) {
      return true;
    }
  }
  return false;
}

// =============================================================================
// Strategy 1: Bordered Tables (Highest Confidence)
// =============================================================================

function detectBorderedTables(lines: TextLine[]): DetectedTable[] {
  const tables: DetectedTable[] = [];
  let tableStart = -1;
  let tableLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    const hasPipe = text.includes('|') || text.includes('¦');
    const isSeparatorOnly = /^[\s\-+|=:¦]+$/.test(text) && text.includes('-');

    if (hasPipe || isSeparatorOnly) {
      if (tableStart === -1) {
        tableStart = i;
      }
      tableLines.push(text);
    } else if (tableStart !== -1) {
      // End of potential table
      if (tableLines.length >= 2) {
        const table = parseBorderedTable(tableLines, tableStart);
        if (table) {
          tables.push(table);
        }
      }
      tableStart = -1;
      tableLines = [];
    }
  }

  // Handle table at end
  if (tableStart !== -1 && tableLines.length >= 2) {
    const table = parseBorderedTable(tableLines, tableStart);
    if (table) {
      tables.push(table);
    }
  }

  return tables;
}

function parseBorderedTable(lines: string[], startLine: number): DetectedTable | null {
  // Normalize ¦ to |
  const normalized = lines.map(l => l.replace(/¦/g, '|'));

  // Filter lines with pipes
  const pipeLines = normalized.filter(t => t.includes('|'));
  if (pipeLines.length < 2) return null;

  // Count pipes per line
  const pipeCounts = pipeLines.map(t => (t.match(/\|/g) || []).length);
  if (Math.max(...pipeCounts) < 2) return null;

  const grid: string[][] = [];

  for (const line of pipeLines) {
    // Skip separator lines
    if (/^[\s|:\-]+$/.test(line)) continue;

    // Split on pipes
    let cells = line.split('|').map(c => c.trim());

    // Remove empty first/last from leading/trailing pipes
    if (cells[0] === '') cells = cells.slice(1);
    if (cells[cells.length - 1] === '') cells = cells.slice(0, -1);

    if (cells.length >= 2) {
      grid.push(cells);
    }
  }

  if (grid.length < 2) return null;

  // Normalize to rectangular
  const maxCols = Math.max(...grid.map(r => r.length));
  const normalizedGrid = grid.map(row => {
    while (row.length < maxCols) row.push('');
    return row;
  });

  // Profile and check
  const prof = profileGrid(normalizedGrid);

  // Bordered tables get +2.0 bonus
  prof.score += 2.0;

  if (!gridPassesProfile(prof)) return null;

  // Convert to table format
  const rows: TableRow[] = normalizedGrid.map((row, idx) => ({
    cells: row.map(text => ({ text })),
    isHeader: idx === 0,
  }));

  return {
    rows,
    columnAlignments: inferColumnAlignments(rows, maxCols),
    confidence: Math.min(1, prof.score / 10),
    startLine,
    endLine: startLine + lines.length - 1,
    detectionType: 'bordered',
  };
}

// =============================================================================
// Strategy 2: ASCII Whitespace Tables
// =============================================================================

function detectAsciiTables(lines: TextLine[], _pageWidth: number): DetectedTable[] {
  const tables: DetectedTable[] = [];
  const texts = lines.map(l => l.text);

  if (texts.length < 2) return tables;
  if (isCodeLikeBlock(texts)) return tables;

  // Split all lines into cells
  const splitLines = texts.map(t => splitCells(t));
  const isRow = splitLines.map(cells => cells.length >= 2);

  if (isRow.filter(Boolean).length < 2) return tables;

  // Find first and last valid table rows
  const firstRow = isRow.indexOf(true);
  const lastRow = isRow.lastIndexOf(true);

  if (firstRow === -1 || lastRow === firstRow) return tables;

  const coreLines = splitLines.slice(firstRow, lastRow + 1);
  const coreFlags = isRow.slice(firstRow, lastRow + 1);

  // Determine target column count (most common)
  const rowCounts = coreLines
    .filter((_, i) => coreFlags[i])
    .map(cells => cells.length);

  const [targetCols, freq] = mostCommonInt(rowCounts);
  if (targetCols < 2 || freq < Math.max(2, 0.6 * rowCounts.length)) {
    return tables;
  }

  // Build grid
  const grid: string[][] = [];
  for (const cells of coreLines) {
    let row: string[];

    if (cells.length < targetCols) {
      // Pad short rows
      row = [...cells];
      while (row.length < targetCols) row.push('');
    } else if (cells.length > targetCols) {
      // Merge overflow into last column
      const head = cells.slice(0, targetCols - 1);
      const tail = cells.slice(targetCols - 1).join(' ').trim();
      row = [...head, tail];
    } else {
      row = cells;
    }

    const cleaned = row.map(c => c.trim());
    if (cleaned.some(Boolean)) {
      grid.push(cleaned);
    }
  }

  if (grid.length < 2) return tables;

  // Profile and check
  const prof = profileGrid(grid);
  if (!gridPassesProfile(prof)) return tables;

  // Convert to table format
  const rows: TableRow[] = grid.map((row, idx) => ({
    cells: row.map(text => ({ text })),
    isHeader: idx === 0,
  }));

  tables.push({
    rows,
    columnAlignments: inferColumnAlignments(rows, targetCols),
    confidence: Math.min(1, prof.score / 10),
    startLine: firstRow,
    endLine: lastRow,
    detectionType: 'ascii',
  });

  return tables;
}

// =============================================================================
// Strategy 3: Vertical Run Tables
// =============================================================================

function detectVerticalRunTables(lines: TextLine[], pageWidth: number): DetectedTable[] {
  const tables: DetectedTable[] = [];

  // Group lines by vertical proximity
  const lineGroups = groupLinesByProximity(lines);

  // Need at least 3 groups (rows) to avoid false positives
  if (lineGroups.length < 3) return tables;

  let idx = 0;
  while (idx < lineGroups.length) {
    const result = detectVerticalRun(lineGroups, idx, pageWidth);
    if (result) {
      const [endIdx, table] = result;
      tables.push(table);
      idx = endIdx;
    } else {
      idx++;
    }
  }

  return tables;
}

function groupLinesByProximity(lines: TextLine[]): TextLine[][] {
  if (lines.length === 0) return [];

  const groups: TextLine[][] = [];
  const sortedByY = [...lines].sort((a, b) => a.y - b.y);

  let currentGroup: TextLine[] = [sortedByY[0]];
  let currentY = sortedByY[0].y;

  for (let i = 1; i < sortedByY.length; i++) {
    const line = sortedByY[i];
    const yDiff = Math.abs(line.y - currentY);
    const avgFontSize = (line.fontSize + (currentGroup[0]?.fontSize || 12)) / 2;

    if (yDiff < avgFontSize * 0.5) {
      currentGroup.push(line);
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup.sort((a, b) => a.x - b.x));
      }
      currentGroup = [line];
      currentY = line.y;
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup.sort((a, b) => a.x - b.x));
  }

  return groups;
}

function detectVerticalRun(
  groups: TextLine[][],
  startIdx: number,
  _pageWidth: number
): [number, DetectedTable] | null {
  if (startIdx >= groups.length) return null;

  const first = groups[startIdx];

  // First group must have multiple items (columns)
  if (first.length < 2) return null;

  // Check if any line looks like a list
  if (first.some(l => isListLikeLine(l.text))) return null;

  const colCount = first.length;
  const matchingGroups: TextLine[][] = [first];

  let idx = startIdx + 1;
  while (idx < groups.length) {
    const group = groups[idx];

    // Must match column count
    if (group.length !== colCount) break;

    // Check for list markers
    if (group.some(l => isListLikeLine(l.text))) break;

    // Check for code
    if (isCodeLikeBlock(group.map(l => l.text))) break;

    matchingGroups.push(group);
    idx++;
  }

  // Need at least 3 matching groups to avoid false positives
  if (matchingGroups.length < 3) return null;

  // Build grid
  const grid: string[][] = matchingGroups.map(group =>
    group.map(l => l.text.trim())
  );

  // Profile and check
  const prof = profileGrid(grid);
  if (!gridPassesProfile(prof)) return null;

  // Convert to table format
  const rows: TableRow[] = grid.map((row, i) => ({
    cells: row.map(text => ({ text })),
    isHeader: i === 0,
  }));

  return [idx, {
    rows,
    columnAlignments: inferColumnAlignments(rows, colCount),
    confidence: Math.min(1, prof.score / 10),
    startLine: 0,
    endLine: matchingGroups.length - 1,
    detectionType: 'vertical',
  }];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Infer column alignments based on content
 */
function inferColumnAlignments(rows: TableRow[], columnCount: number): ('left' | 'center' | 'right')[] {
  const alignments: ('left' | 'center' | 'right')[] = [];

  for (let col = 0; col < columnCount; col++) {
    let numericCount = 0;
    let totalCount = 0;

    for (const row of rows) {
      if (row.isHeader) continue;
      const cell = row.cells[col];
      if (!cell || !cell.text.trim()) continue;

      totalCount++;
      if (cellIsNumeric(cell.text)) {
        numericCount++;
      }
    }

    // If >70% numeric, align right
    if (totalCount > 0 && numericCount / totalCount > 0.7) {
      alignments.push('right');
    } else {
      alignments.push('left');
    }
  }

  return alignments;
}

/**
 * Convert a detected table to Markdown format
 */
export function tableToMarkdown(table: DetectedTable): string {
  const lines: string[] = [];
  const columnWidths = calculateColumnWidths(table);

  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex++) {
    const row = table.rows[rowIndex];
    const cells: string[] = [];

    for (let colIndex = 0; colIndex < table.columnAlignments.length; colIndex++) {
      const cell = row.cells[colIndex] || { text: '' };
      const text = escapeTableCell(cell.text);
      cells.push(padCell(text, columnWidths[colIndex], table.columnAlignments[colIndex]));
    }

    lines.push('| ' + cells.join(' | ') + ' |');

    // Add header separator after first row
    if (rowIndex === 0) {
      const separators = table.columnAlignments.map((align, idx) => {
        const width = columnWidths[idx];
        const dashes = '-'.repeat(Math.max(width, 3));
        if (align === 'center') return ':' + dashes.slice(1, -1) + ':';
        if (align === 'right') return dashes.slice(0, -1) + ':';
        return dashes;
      });
      lines.push('| ' + separators.join(' | ') + ' |');
    }
  }

  return lines.join('\n');
}

function calculateColumnWidths(table: DetectedTable): number[] {
  const widths: number[] = [];

  for (let col = 0; col < table.columnAlignments.length; col++) {
    let maxWidth = 3;
    for (const row of table.rows) {
      const cell = row.cells[col];
      if (cell) {
        maxWidth = Math.max(maxWidth, cell.text.length);
      }
    }
    widths.push(Math.min(maxWidth, 50));
  }

  return widths;
}

function padCell(text: string, width: number, align: 'left' | 'center' | 'right'): string {
  const padding = width - text.length;
  if (padding <= 0) return text;

  if (align === 'right') {
    return ' '.repeat(padding) + text;
  } else if (align === 'center') {
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  }
  return text + ' '.repeat(padding);
}

function escapeTableCell(text: string): string {
  return text
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .trim();
}

/**
 * Check if text block looks like table content based on heuristics
 */
export function scoreTableLikelihood(text: string): number {
  let score = 0;

  // Check for pipe characters
  if (/\|/.test(text)) score += 0.3;

  // Check for multiple whitespace gaps
  const cells = splitCells(text);
  if (cells.length >= 2) score += 0.2;
  if (cells.length >= 4) score += 0.1;

  // Check for numeric patterns
  const numbers = text.match(/\d+([,.\d]*)?/g);
  if (numbers && numbers.length >= 3) score += 0.2;

  // Check for aligned columns pattern
  if (/\t/.test(text) || /\s{3,}/.test(text)) score += 0.1;

  // Check for currency/percentage patterns
  if (/[$€£%]/.test(text)) score += 0.1;

  return Math.min(1, score);
}

// =============================================================================
// Positioned Row Table Detection (Uses actual character x-coordinates)
// =============================================================================

/**
 * Input type from pdfProcessor's character-level extraction
 */
export interface PositionedCell {
  text: string;
  x: number;
  width: number;
}

export interface PositionedRow {
  cells: PositionedCell[];
  y: number;
}

/**
 * Find column boundaries by clustering cell x-positions across all rows.
 * This is similar to pdfmd's approach of using x-coordinate clustering.
 */
function findColumnBoundaries(rows: PositionedRow[], tolerance: number = 15): number[] {
  // Collect all cell x-positions
  const xPositions: number[] = [];
  for (const row of rows) {
    for (const cell of row.cells) {
      xPositions.push(cell.x);
    }
  }

  if (xPositions.length === 0) return [];

  // Sort and cluster x-positions
  const sorted = [...xPositions].sort((a, b) => a - b);
  const boundaries: number[] = [];
  let currentCluster = sorted[0];
  let clusterCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - currentCluster <= tolerance * clusterCount) {
      // Same cluster - update center
      currentCluster = (currentCluster * clusterCount + sorted[i]) / (clusterCount + 1);
      clusterCount++;
    } else {
      // New cluster
      boundaries.push(currentCluster);
      currentCluster = sorted[i];
      clusterCount = 1;
    }
  }
  boundaries.push(currentCluster);

  return boundaries;
}

/**
 * Assign a cell to a column based on its x-position and the column boundaries.
 */
function assignCellToColumn(cellX: number, boundaries: number[], _tolerance: number = 15): number {
  let bestCol = 0;
  let bestDist = Math.abs(cellX - boundaries[0]);

  for (let i = 1; i < boundaries.length; i++) {
    const dist = Math.abs(cellX - boundaries[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestCol = i;
    }
  }

  return bestCol;
}

/**
 * Build a grid from positioned rows using column boundaries.
 */
function buildGridFromPositionedRows(
  rows: PositionedRow[],
  boundaries: number[]
): string[][] {
  const grid: string[][] = [];

  for (const row of rows) {
    const rowCells: string[] = new Array(boundaries.length).fill('');

    for (const cell of row.cells) {
      const colIdx = assignCellToColumn(cell.x, boundaries);
      // If multiple cells map to same column, concatenate them
      if (rowCells[colIdx]) {
        rowCells[colIdx] += ' ' + cell.text.trim();
      } else {
        rowCells[colIdx] = cell.text.trim();
      }
    }

    grid.push(rowCells);
  }

  return grid;
}

/**
 * Detect tables from positioned row data (with accurate x-coordinate information).
 * This is the preferred detection method when character-level positions are available.
 */
export function detectTablesFromPositionedRows(rows: PositionedRow[]): DetectedTable[] {
  const tables: DetectedTable[] = [];

  if (rows.length < 2) return tables;

  // Group rows by proximity in y-coordinate to find potential table regions
  const sortedRows = [...rows].sort((a, b) => a.y - b.y);

  // Find contiguous regions where rows have similar column counts
  let regionStart = 0;
  while (regionStart < sortedRows.length) {
    const startRow = sortedRows[regionStart];

    // Skip rows with only one cell (likely not a table)
    if (startRow.cells.length < 2) {
      regionStart++;
      continue;
    }

    // Find extent of this potential table region
    let regionEnd = regionStart + 1;
    const startColCount = startRow.cells.length;

    while (regionEnd < sortedRows.length) {
      const row = sortedRows[regionEnd];
      const yDiff = row.y - sortedRows[regionEnd - 1].y;

      // Large y-gap suggests end of table
      if (yDiff > 50) break;

      // Very different column count suggests end of table
      if (Math.abs(row.cells.length - startColCount) > 2 && row.cells.length < 2) break;

      regionEnd++;
    }

    // Process this region as a potential table
    const regionRows = sortedRows.slice(regionStart, regionEnd);

    if (regionRows.length >= 2) {
      // Filter to rows with multiple cells
      const tableCandidateRows = regionRows.filter(r => r.cells.length >= 2);

      if (tableCandidateRows.length >= 2) {
        const table = tryBuildTable(tableCandidateRows, regionStart, regionEnd - 1);
        if (table) {
          tables.push(table);
        }
      }
    }

    regionStart = regionEnd;
  }

  return tables;
}

/**
 * Try to build a table from a set of positioned rows.
 */
function tryBuildTable(
  rows: PositionedRow[],
  startLine: number,
  endLine: number
): DetectedTable | null {
  // Find column boundaries
  const boundaries = findColumnBoundaries(rows);

  if (boundaries.length < 2) return null;

  // Build grid
  const grid = buildGridFromPositionedRows(rows, boundaries);

  // Profile the grid
  const prof = profileGrid(grid);

  // Check if it passes profile requirements
  if (!gridPassesProfile(prof)) return null;

  // NOTE: Two-column prose detection is now handled by layoutAnalyzer.ts
  // at the page level, before table detection runs. This prevents
  // academic papers from being falsely detected as tables.

  // Check for too many sentences or prose-like content
  if (prof.sentenceCells > 0 && prof.sentenceCells >= 0.3 * prof.nonEmptyCells) {
    // Only allow if we have strong numeric/short-token signals
    if (prof.shortTokenCells + prof.numericCells < 0.4 * prof.nonEmptyCells) {
      return null;
    }
  }

  // STRICT: Check for long cells (prose fragments from two-column layouts)
  if (prof.avgLen > 50) {
    // Long average = likely prose, not table
    const tabularRatio = (prof.shortTokenCells + prof.numericCells) / prof.nonEmptyCells;
    if (tabularRatio < 0.5) {
      return null;
    }
  }

  // Convert to table format
  const tableRows: TableRow[] = grid.map((row, i) => ({
    cells: row.map(text => ({ text })),
    isHeader: i === 0,
  }));

  // Determine column alignments
  const alignments = determineColumnAlignmentsFromGrid(grid);

  // Calculate confidence based on profile score
  const confidence = Math.min(1.0, Math.max(0.4, prof.score / 10));

  return {
    rows: tableRows,
    columnAlignments: alignments,
    confidence,
    startLine,
    endLine,
    detectionType: 'vertical',
  };
}

/**
 * Determine column alignments from grid content.
 */
function determineColumnAlignmentsFromGrid(grid: string[][]): ('left' | 'center' | 'right')[] {
  const nCols = grid[0]?.length || 0;
  const alignments: ('left' | 'center' | 'right')[] = [];

  for (let col = 0; col < nCols; col++) {
    let numericCount = 0;
    let totalCount = 0;

    for (const row of grid) {
      const cell = row[col];
      if (cell && cell.trim()) {
        totalCount++;
        if (cellIsNumeric(cell)) {
          numericCount++;
        }
      }
    }

    // Right-align if mostly numeric
    if (totalCount > 0 && numericCount / totalCount > 0.5) {
      alignments.push('right');
    } else {
      alignments.push('left');
    }
  }

  return alignments;
}
