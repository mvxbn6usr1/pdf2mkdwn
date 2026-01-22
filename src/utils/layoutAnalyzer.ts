/**
 * Layout Analyzer Module
 *
 * Provides holistic page layout analysis BEFORE any content detection.
 * This module understands:
 * - Page column structure (single-column, two-column, mixed)
 * - Region classification (prose, table, heading, list, code)
 * - Reading order resolution
 *
 * The key insight: we must understand page LAYOUT before detecting CONTENT.
 * A two-column academic paper is NOT a table, even though both have
 * vertically-aligned text in multiple columns.
 */

// =============================================================================
// Types
// =============================================================================

export interface PositionedChar {
  char: string;
  x: number;
  y: number;
  fontSize: number;
}

export interface PositionedLine {
  chars: PositionedChar[];
  y: number;
  minX: number;
  maxX: number;
  text: string;
  avgFontSize: number;
}

export interface TextBlock {
  lines: PositionedLine[];
  bbox: { x: number; y: number; w: number; h: number };
  text: string;
  avgFontSize: number;
}

export type RegionType =
  | 'prose'              // Regular paragraph text
  | 'prose-column'       // Part of multi-column prose layout (NOT a table)
  | 'potential-table'    // Likely a data table
  | 'heading'            // Title/heading text
  | 'list'               // Bullet or numbered list
  | 'code'               // Code block
  | 'unknown';

export interface PageColumn {
  x: number;           // Left edge
  width: number;       // Column width
  blocks: TextBlock[]; // Blocks in this column
}

export interface ClassifiedRegion {
  type: RegionType;
  blocks: TextBlock[];
  bbox: { x: number; y: number; w: number; h: number };
  confidence: number;
  columnIndex?: number;  // Which page column this belongs to
}

export interface PageLayout {
  columns: PageColumn[];
  regions: ClassifiedRegion[];
  isMultiColumn: boolean;
  pageWidth: number;
  pageHeight: number;
}

// =============================================================================
// Column Detection
// =============================================================================

/**
 * Detect page column structure by analyzing x-coordinate distribution.
 *
 * Key insight: Page columns have these characteristics:
 * - Each column spans a significant portion of page width (>30%)
 * - Columns have clear gaps between them (>5% of page width)
 * - Blocks within a column share similar x-ranges
 * - Columns typically span most of the page height
 */
export function detectPageColumns(
  lines: PositionedLine[],
  pageWidth: number,
  pageHeight: number
): PageColumn[] {
  if (lines.length === 0) return [];

  // Collect all line x-ranges
  const lineRanges = lines.map(line => ({
    minX: line.minX,
    maxX: line.maxX,
    centerX: (line.minX + line.maxX) / 2,
    width: line.maxX - line.minX,
    line,
  }));

  // Find clusters of x-positions using histogram approach
  const binWidth = pageWidth / 50; // 50 bins across page
  const histogram = new Array(50).fill(0);

  for (const range of lineRanges) {
    const startBin = Math.floor(range.minX / binWidth);
    const endBin = Math.min(49, Math.floor(range.maxX / binWidth));
    for (let i = startBin; i <= endBin; i++) {
      histogram[i]++;
    }
  }

  // Find gaps (bins with very few lines)
  const avgDensity = histogram.reduce((a, b) => a + b, 0) / 50;
  const gapThreshold = avgDensity * 0.2; // Gaps have <20% of average density

  const gaps: number[] = [];
  let inGap = false;
  let gapStart = 0;

  for (let i = 0; i < 50; i++) {
    if (histogram[i] < gapThreshold) {
      if (!inGap) {
        inGap = true;
        gapStart = i;
      }
    } else {
      if (inGap) {
        const gapCenter = ((gapStart + i) / 2) * binWidth;
        const gapWidth = (i - gapStart) * binWidth;
        // Only count significant gaps (>3% of page width)
        if (gapWidth > pageWidth * 0.03) {
          gaps.push(gapCenter);
        }
        inGap = false;
      }
    }
  }

  // Create columns based on gaps
  const columnBoundaries = [0, ...gaps, pageWidth];
  const columns: PageColumn[] = [];

  for (let i = 0; i < columnBoundaries.length - 1; i++) {
    const colLeft = columnBoundaries[i];
    const colRight = columnBoundaries[i + 1];
    const colWidth = colRight - colLeft;

    // Only count as column if it's substantial (>20% of page width)
    if (colWidth < pageWidth * 0.20) continue;

    // Find lines that belong to this column
    const colLines = lines.filter(line => {
      const lineCenter = (line.minX + line.maxX) / 2;
      return lineCenter >= colLeft && lineCenter < colRight;
    });

    if (colLines.length > 0) {
      columns.push({
        x: colLeft,
        width: colWidth,
        blocks: groupLinesIntoBlocks(colLines, pageHeight),
      });
    }
  }

  // If no clear columns found, treat entire page as single column
  if (columns.length === 0) {
    return [{
      x: 0,
      width: pageWidth,
      blocks: groupLinesIntoBlocks(lines, pageHeight),
    }];
  }

  return columns;
}

/**
 * Group lines into blocks based on vertical proximity.
 */
function groupLinesIntoBlocks(lines: PositionedLine[], _pageHeight: number): TextBlock[] {
  if (lines.length === 0) return [];

  // Sort by y position
  const sorted = [...lines].sort((a, b) => a.y - b.y);

  const blocks: TextBlock[] = [];
  let currentBlock: PositionedLine[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    // Gap between lines
    const yGap = curr.y - prev.y;
    const avgFontSize = (prev.avgFontSize + curr.avgFontSize) / 2;

    // If gap is larger than ~2x font size, start new block
    if (yGap > avgFontSize * 2.5) {
      blocks.push(createBlock(currentBlock));
      currentBlock = [curr];
    } else {
      currentBlock.push(curr);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(createBlock(currentBlock));
  }

  return blocks;
}

function createBlock(lines: PositionedLine[]): TextBlock {
  const minX = Math.min(...lines.map(l => l.minX));
  const maxX = Math.max(...lines.map(l => l.maxX));
  const minY = Math.min(...lines.map(l => l.y));
  const maxY = Math.max(...lines.map(l => l.y));
  const avgFontSize = lines.reduce((sum, l) => sum + l.avgFontSize, 0) / lines.length;

  return {
    lines,
    bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY + avgFontSize },
    text: lines.map(l => l.text).join('\n'),
    avgFontSize,
  };
}

// =============================================================================
// Region Classification
// =============================================================================

/**
 * Classify a block by its content type.
 *
 * This is the CRITICAL function that distinguishes:
 * - Two-column prose (NOT a table)
 * - Actual data tables (IS a table)
 * - Headings, lists, code blocks
 */
export function classifyBlock(block: TextBlock, pageWidth: number): { type: RegionType; confidence: number } {
  // Check for list FIRST (lists have specific markers that are unambiguous)
  if (isListBlock(block)) {
    return { type: 'list', confidence: 0.85 };
  }

  // Check for code block (before heading, as code can be short)
  if (isCodeBlock(block)) {
    return { type: 'code', confidence: 0.8 };
  }

  // Check for heading (usually short, larger font, no punctuation)
  if (isHeadingBlock(block, pageWidth)) {
    return { type: 'heading', confidence: 0.9 };
  }

  // Analyze content patterns
  const proseScore = calculateProseScore(block);
  const tableScore = calculateTableScore(block);

  // If clearly prose-like, classify as prose
  if (proseScore > 0.7 && tableScore < 0.3) {
    return { type: 'prose', confidence: proseScore };
  }

  // If clearly table-like, mark as potential table
  if (tableScore > 0.6 && proseScore < 0.4) {
    return { type: 'potential-table', confidence: tableScore };
  }

  // Ambiguous - lean towards prose for safety (false positive tables are worse)
  if (proseScore >= tableScore) {
    return { type: 'prose', confidence: 0.5 };
  }

  return { type: 'potential-table', confidence: 0.5 };
}

function isHeadingBlock(block: TextBlock, _pageWidth: number): boolean {
  // Headings are typically:
  // - 1-3 lines
  // - Shorter text (< 200 chars total)
  // - Often larger font (but we may not have global context yet)
  // - Don't end with sentence-ending punctuation typically

  if (block.lines.length > 3) return false;
  if (block.text.length > 200) return false;

  // Check if it looks like a sentence (headings usually don't)
  const trimmed = block.text.trim();
  if (/[.!?]$/.test(trimmed) && block.text.length > 50) return false;

  // If very short and no punctuation, likely heading
  if (block.text.length < 100 && !/[.!?,;:]/.test(trimmed)) {
    return true;
  }

  return false;
}

function isListBlock(block: TextBlock): boolean {
  const bulletPatterns = /^[\s]*[-•●○◦▪▸►◆✓✗★☆\u2022\u2023\u25E6\u2043\u2219]/;
  const numberPatterns = /^[\s]*\d+[.)]\s/;

  let listLineCount = 0;
  for (const line of block.lines) {
    if (bulletPatterns.test(line.text) || numberPatterns.test(line.text)) {
      listLineCount++;
    }
  }

  // If majority of lines look like list items
  return listLineCount >= block.lines.length * 0.6;
}

function isCodeBlock(block: TextBlock): boolean {
  const codePatterns = [
    /^[\s]*[{}()\[\]<>][\s]*$/,           // Lone brackets
    /^[\s]*(if|else|for|while|return|function|def|class|import|from)\b/,
    /[{};]$/,                              // Ends with code punctuation
    /^\s{4,}/,                             // Heavy indentation
    /[a-zA-Z_]\w*\s*\(/,                  // Function calls
    /[a-zA-Z_]\w*\s*=\s*[^=]/,           // Assignments
  ];

  let codeLineCount = 0;
  for (const line of block.lines) {
    for (const pattern of codePatterns) {
      if (pattern.test(line.text)) {
        codeLineCount++;
        break;
      }
    }
  }

  return codeLineCount >= block.lines.length * 0.5;
}

/**
 * Calculate how "prose-like" a block is.
 *
 * Prose characteristics:
 * - Long sentences with punctuation
 * - Common English words (the, is, was, that, etc.)
 * - Varied word lengths
 * - Lines fill most of the available width
 */
function calculateProseScore(block: TextBlock): number {
  let score = 0;
  const text = block.text;
  const words = text.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) return 0;

  // Check for sentence patterns
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgWordsPerSentence = words.length / Math.max(1, sentences.length);
  if (avgWordsPerSentence >= 5 && avgWordsPerSentence <= 30) {
    score += 0.25; // Normal sentence length
  }

  // Check for common prose words
  const proseWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'also', 'just', 'than', 'then', 'now', 'here', 'there',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'their', 'them',
    'he', 'she', 'his', 'her', 'we', 'our', 'you', 'your', 'who', 'which', 'what'];

  const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
  const proseWordCount = lowerWords.filter(w => proseWords.includes(w)).length;
  const proseWordRatio = proseWordCount / words.length;

  if (proseWordRatio > 0.15) score += 0.25;
  if (proseWordRatio > 0.25) score += 0.15;

  // Check for punctuation at end of lines (sentences)
  let punctuatedLines = 0;
  for (const line of block.lines) {
    if (/[.!?,;:][\s"')\]]*$/.test(line.text.trim())) {
      punctuatedLines++;
    }
  }
  if (punctuatedLines > block.lines.length * 0.3) {
    score += 0.2;
  }

  // Check average word length (prose has varied lengths, tables often have short tokens)
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  if (avgWordLength >= 4 && avgWordLength <= 8) {
    score += 0.15; // Typical English word length
  }

  return Math.min(1.0, score);
}

/**
 * Calculate how "table-like" a block is.
 *
 * Table characteristics:
 * - Short cells (tokens, numbers)
 * - Consistent structure across rows
 * - Numeric data, currency, percentages
 * - Aligned columns
 * - Pipe characters or clear separators
 */
function calculateTableScore(block: TextBlock): number {
  let score = 0;
  const lines = block.lines;
  const text = block.text;

  // Check for explicit table markers (pipes)
  if (/\|/.test(text)) {
    score += 0.4;
  }

  // Analyze each line for table characteristics
  let shortTokenLines = 0;
  let numericLines = 0;
  let consistentCellCount = 0;
  let prevCellCount = -1;

  for (const line of lines) {
    // Split by whitespace gaps
    const cells = line.text.split(/\s{2,}/).filter(c => c.trim().length > 0);

    // Check cell count consistency
    if (prevCellCount === -1) {
      prevCellCount = cells.length;
    } else if (cells.length === prevCellCount && cells.length >= 2) {
      consistentCellCount++;
    }
    prevCellCount = cells.length;

    // Check if cells are short tokens
    const shortTokens = cells.filter(c => c.trim().length <= 20 && !c.includes(' ')).length;
    if (shortTokens >= cells.length * 0.5) {
      shortTokenLines++;
    }

    // Check for numeric content
    const numericCells = cells.filter(c => /^[\d$€£%.,\-+()]+$/.test(c.trim())).length;
    if (numericCells >= 1) {
      numericLines++;
    }
  }

  // Score based on table indicators
  if (shortTokenLines >= lines.length * 0.4) score += 0.25;
  if (numericLines >= lines.length * 0.3) score += 0.2;
  if (consistentCellCount >= lines.length * 0.6 - 1) score += 0.15;

  // Penalize if text is too long (tables have short cells)
  const avgLineLength = text.length / Math.max(1, lines.length);
  if (avgLineLength > 100) score -= 0.2;

  return Math.max(0, Math.min(1.0, score));
}

// =============================================================================
// Main Layout Analysis
// =============================================================================

/**
 * Analyze the complete layout of a page.
 *
 * This is the main entry point that should be called BEFORE any
 * table detection or math detection.
 */
export function analyzePageLayout(
  lines: PositionedLine[],
  pageWidth: number,
  pageHeight: number
): PageLayout {
  // Step 1: Detect page column structure
  const columns = detectPageColumns(lines, pageWidth, pageHeight);
  const isMultiColumn = columns.length > 1;

  // Step 2: Classify each block within each column
  const regions: ClassifiedRegion[] = [];

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const column = columns[colIdx];

    for (const block of column.blocks) {
      const { type, confidence } = classifyBlock(block, pageWidth);

      // If multi-column layout and block is prose, mark as prose-column
      const finalType = (isMultiColumn && type === 'prose') ? 'prose-column' : type;

      regions.push({
        type: finalType,
        blocks: [block],
        bbox: block.bbox,
        confidence,
        columnIndex: colIdx,
      });
    }
  }

  // Step 3: Merge adjacent regions of the same type
  const mergedRegions = mergeAdjacentRegions(regions);

  return {
    columns,
    regions: mergedRegions,
    isMultiColumn,
    pageWidth,
    pageHeight,
  };
}

/**
 * Merge adjacent regions of the same type within the same column.
 */
function mergeAdjacentRegions(regions: ClassifiedRegion[]): ClassifiedRegion[] {
  if (regions.length === 0) return [];

  // Sort by column, then by y position
  const sorted = [...regions].sort((a, b) => {
    if ((a.columnIndex ?? 0) !== (b.columnIndex ?? 0)) {
      return (a.columnIndex ?? 0) - (b.columnIndex ?? 0);
    }
    return a.bbox.y - b.bbox.y;
  });

  const merged: ClassifiedRegion[] = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Merge if same type and same column
    if (current.type === next.type && current.columnIndex === next.columnIndex) {
      // Merge blocks and expand bbox
      current = {
        type: current.type,
        blocks: [...current.blocks, ...next.blocks],
        bbox: {
          x: Math.min(current.bbox.x, next.bbox.x),
          y: Math.min(current.bbox.y, next.bbox.y),
          w: Math.max(current.bbox.x + current.bbox.w, next.bbox.x + next.bbox.w) -
             Math.min(current.bbox.x, next.bbox.x),
          h: Math.max(current.bbox.y + current.bbox.h, next.bbox.y + next.bbox.h) -
             Math.min(current.bbox.y, next.bbox.y),
        },
        confidence: (current.confidence + next.confidence) / 2,
        columnIndex: current.columnIndex,
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  return merged;
}

// =============================================================================
// Utility Functions for Integration
// =============================================================================

/**
 * Check if a region should be processed as a table.
 */
export function shouldProcessAsTable(region: ClassifiedRegion): boolean {
  return region.type === 'potential-table' && region.confidence > 0.5;
}

/**
 * Check if the page has a multi-column prose layout.
 * This is important because multi-column prose should NOT be detected as tables.
 */
export function hasMultiColumnProseLayout(layout: PageLayout): boolean {
  return layout.isMultiColumn &&
    layout.regions.some(r => r.type === 'prose-column');
}

/**
 * Get all blocks that should be processed for table detection.
 * Excludes multi-column prose, headings, lists, and code.
 */
export function getTableCandidateBlocks(layout: PageLayout): TextBlock[] {
  const candidates: TextBlock[] = [];

  for (const region of layout.regions) {
    if (shouldProcessAsTable(region)) {
      candidates.push(...region.blocks);
    }
  }

  return candidates;
}

/**
 * Convert PositionedLine to text with proper reading order.
 * For multi-column layouts, processes each column in order.
 */
export function getReadingOrderText(layout: PageLayout): string {
  const parts: string[] = [];

  // Sort columns left to right
  const sortedColumns = [...layout.columns].sort((a, b) => a.x - b.x);

  for (const column of sortedColumns) {
    // Sort blocks top to bottom within column
    const sortedBlocks = [...column.blocks].sort((a, b) => a.bbox.y - b.bbox.y);

    for (const block of sortedBlocks) {
      parts.push(block.text);
    }
  }

  return parts.join('\n\n');
}

/**
 * Create PositionedLine from character data.
 * Helper for integration with pdfProcessor.
 */
export function createPositionedLine(
  chars: PositionedChar[],
  y: number,
  minX: number,
  maxX: number
): PositionedLine {
  const text = chars.map(c => c.char).join('');
  const avgFontSize = chars.length > 0
    ? chars.reduce((sum, c) => sum + c.fontSize, 0) / chars.length
    : 12;

  return {
    chars,
    y,
    minX,
    maxX,
    text,
    avgFontSize,
  };
}
