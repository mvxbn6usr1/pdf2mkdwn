/**
 * Text Transforms Module
 *
 * Handles various text transformations:
 * - Header/Footer detection and removal
 * - Hyphenation repair
 * - Drop cap removal
 * - Line defragmentation
 * - Bullet line merging
 */

export interface HeaderFooterPattern {
  text: string;
  pageCount: number;
  isHeader: boolean;
  similarity: number;
}

/**
 * Calculate Jaccard similarity between two strings
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Normalize text for comparison (removes page numbers, whitespace variations)
 */
function normalizeForComparison(text: string): string {
  return text
    .replace(/\d+/g, '#') // Replace numbers with placeholder
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .toLowerCase();
}

export interface PageLines {
  pageNumber: number;
  firstLines: string[];
  lastLines: string[];
}

/**
 * Detect header and footer patterns across pages
 */
export function detectHeaderFooterPatterns(
  pages: PageLines[],
  linesToCheck: number = 3,
  similarityThreshold: number = 0.8
): { headers: string[]; footers: string[] } {
  if (pages.length < 3) {
    return { headers: [], footers: [] };
  }

  const headers: string[] = [];
  const footers: string[] = [];

  // Analyze first lines (potential headers)
  for (let lineIdx = 0; lineIdx < linesToCheck; lineIdx++) {
    const candidates = new Map<string, number>();

    for (const page of pages) {
      if (page.firstLines[lineIdx]) {
        const normalized = normalizeForComparison(page.firstLines[lineIdx]);
        if (normalized.length > 0) {
          // Find similar existing candidates
          let foundMatch = false;
          for (const [existing, count] of candidates) {
            if (jaccardSimilarity(normalized, existing) >= similarityThreshold) {
              candidates.set(existing, count + 1);
              foundMatch = true;
              break;
            }
          }
          if (!foundMatch) {
            candidates.set(normalized, 1);
          }
        }
      }
    }

    // If a pattern appears on >50% of pages, it's likely a header
    for (const [pattern, count] of candidates) {
      if (count >= pages.length * 0.5) {
        headers.push(pattern);
      }
    }
  }

  // Analyze last lines (potential footers)
  for (let lineIdx = 0; lineIdx < linesToCheck; lineIdx++) {
    const candidates = new Map<string, number>();

    for (const page of pages) {
      const lastLines = page.lastLines;
      const idx = lastLines.length - 1 - lineIdx;
      if (idx >= 0 && lastLines[idx]) {
        const normalized = normalizeForComparison(lastLines[idx]);
        if (normalized.length > 0) {
          let foundMatch = false;
          for (const [existing, count] of candidates) {
            if (jaccardSimilarity(normalized, existing) >= similarityThreshold) {
              candidates.set(existing, count + 1);
              foundMatch = true;
              break;
            }
          }
          if (!foundMatch) {
            candidates.set(normalized, 1);
          }
        }
      }
    }

    for (const [pattern, count] of candidates) {
      if (count >= pages.length * 0.5) {
        footers.push(pattern);
      }
    }
  }

  return { headers, footers };
}

/**
 * Check if a line matches a header/footer pattern
 */
export function matchesHeaderFooterPattern(
  line: string,
  patterns: string[],
  threshold: number = 0.8
): boolean {
  const normalized = normalizeForComparison(line);
  if (normalized.length === 0) return false;

  for (const pattern of patterns) {
    if (jaccardSimilarity(normalized, pattern) >= threshold) {
      return true;
    }
  }

  return false;
}

/**
 * Remove headers and footers from text based on detected patterns
 */
export function removeHeadersFooters(
  text: string,
  headers: string[],
  footers: string[],
  threshold: number = 0.8
): string {
  const lines = text.split('\n');
  const filteredLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      filteredLines.push(line);
      continue;
    }

    const isHeader = matchesHeaderFooterPattern(trimmed, headers, threshold);
    const isFooter = matchesHeaderFooterPattern(trimmed, footers, threshold);

    if (!isHeader && !isFooter) {
      filteredLines.push(line);
    }
  }

  return filteredLines.join('\n');
}

/**
 * Fix hyphenation breaks (word-\n continuation)
 */
export function fixHyphenation(text: string): string {
  // Pattern: word ending with hyphen followed by newline and continuation
  // e.g., "compre-\nhensive" -> "comprehensive"
  return text.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2');
}

/**
 * Advanced hyphenation fix that also handles soft hyphens
 */
export function fixHyphenationAdvanced(text: string): string {
  let result = text;

  // Fix standard hyphenation breaks
  result = result.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2');

  // Fix soft hyphens (U+00AD)
  result = result.replace(/\u00AD/g, '');

  // Fix en-dash used as hyphen at line breaks
  result = result.replace(/(\w)\u2013\s*\n\s*(\w)/g, '$1$2');

  return result;
}

export interface TextSpan {
  text: string;
  fontSize: number;
}

/**
 * Detect and remove drop caps (oversized decorative first letters)
 */
export function removeDropCaps(spans: TextSpan[]): TextSpan[] {
  if (spans.length === 0) return spans;

  // Calculate median font size
  const fontSizes = spans.map(s => s.fontSize).sort((a, b) => a - b);
  const medianSize = fontSizes[Math.floor(fontSizes.length / 2)];

  const result: TextSpan[] = [];
  let skipNext = false;

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];

    if (skipNext) {
      skipNext = false;
      continue;
    }

    // Check if this is a drop cap:
    // 1. Single character
    // 2. Font size >= 1.5x median
    // 3. First in a paragraph (or first visible character)
    const isDropCap =
      span.text.trim().length === 1 &&
      span.fontSize >= medianSize * 1.5 &&
      /^[A-Z]$/.test(span.text.trim());

    if (isDropCap) {
      // Merge with next span if it continues the word
      if (i + 1 < spans.length) {
        const nextSpan = spans[i + 1];
        if (nextSpan.text.trim().length > 0 && /^[a-z]/.test(nextSpan.text.trim())) {
          result.push({
            text: span.text.trim() + nextSpan.text,
            fontSize: nextSpan.fontSize,
          });
          skipNext = true;
          continue;
        }
      }
    }

    result.push(span);
  }

  return result;
}

/**
 * Defragment lines: reattach short orphaned lines to preceding paragraphs
 */
export function defragmentLines(text: string, maxOrphanLength: number = 45): string {
  const lines = text.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      result.push(line);
      continue;
    }

    // Check if this is a potential orphan line:
    // 1. Short (under threshold)
    // 2. Doesn't look like a heading (no # prefix)
    // 3. Doesn't look like a list item
    // 4. Previous line exists and isn't empty
    const isOrphan =
      trimmed.length <= maxOrphanLength &&
      !trimmed.startsWith('#') &&
      !/^[-*\d]+[.\)]\s/.test(trimmed) &&
      result.length > 0 &&
      result[result.length - 1].trim();

    // Also check if it starts with lowercase (strong indicator of continuation)
    const startsLowercase = /^[a-z]/.test(trimmed);

    if (isOrphan && (startsLowercase || !trimmed.match(/^[A-Z]/))) {
      // Check previous line - if it doesn't end with terminal punctuation, merge
      const prevLine = result[result.length - 1];
      const prevTrimmed = prevLine.trim();

      const prevEndsIncomplete = !prevTrimmed.match(/[.!?:;]$/);

      if (prevEndsIncomplete || startsLowercase) {
        // Merge with previous line
        result[result.length - 1] = prevTrimmed + ' ' + trimmed;
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Merge standalone bullet characters with following text lines
 */
export function mergeBulletLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this is a standalone bullet
    const isStandaloneBullet = /^[-*\u2022\u2023\u25E6\u2043\u2219•◦‣⁃●○]$/.test(trimmed);

    if (isStandaloneBullet && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine && !/^[-*\u2022\u2023\u25E6\u2043\u2219•◦‣⁃●○\d]/.test(nextLine)) {
        // Merge bullet with next line
        result.push(`- ${nextLine}`);
        i++; // Skip next line
        continue;
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

export interface ProcessingStats {
  wordCount: number;
  headingCount: number;
  tableCount: number;
  listItemCount: number;
  imageCount: number;
  pageCount: number;
}

/**
 * Calculate processing statistics from markdown output
 */
export function calculateStats(markdown: string, pageCount: number = 1): ProcessingStats {
  // Count words (excluding markdown syntax)
  const textOnly = markdown
    .replace(/^#+\s+/gm, '') // Remove heading markers
    .replace(/[*_`~]/g, '') // Remove emphasis markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract link text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // Remove images
    .replace(/\|/g, ' '); // Replace table pipes with spaces

  const words = textOnly.match(/\b\w+\b/g) || [];
  const wordCount = words.length;

  // Count headings
  const headings = markdown.match(/^#+\s+.+$/gm) || [];
  const headingCount = headings.length;

  // Count tables (by looking for markdown table patterns)
  // Group consecutive table rows
  let tableCount = 0;
  let inTable = false;
  for (const line of markdown.split('\n')) {
    if (/^\|.+\|$/.test(line.trim())) {
      if (!inTable) {
        tableCount++;
        inTable = true;
      }
    } else {
      inTable = false;
    }
  }

  // Count list items
  const listItems = markdown.match(/^[\s]*[-*+]\s+.+$/gm) || [];
  const numberedItems = markdown.match(/^[\s]*\d+[.\)]\s+.+$/gm) || [];
  const listItemCount = listItems.length + numberedItems.length;

  // Count images
  const images = markdown.match(/!\[[^\]]*\]\([^)]+\)/g) || [];
  const imageCount = images.length;

  return {
    wordCount,
    headingCount,
    tableCount,
    listItemCount,
    imageCount,
    pageCount,
  };
}

/**
 * Format stats for display
 */
export function formatStats(stats: ProcessingStats): string {
  const parts: string[] = [];

  if (stats.wordCount > 0) {
    parts.push(`${stats.wordCount.toLocaleString()} words`);
  }
  if (stats.headingCount > 0) {
    parts.push(`${stats.headingCount} heading${stats.headingCount !== 1 ? 's' : ''}`);
  }
  if (stats.tableCount > 0) {
    parts.push(`${stats.tableCount} table${stats.tableCount !== 1 ? 's' : ''}`);
  }
  if (stats.listItemCount > 0) {
    parts.push(`${stats.listItemCount} list item${stats.listItemCount !== 1 ? 's' : ''}`);
  }
  if (stats.imageCount > 0) {
    parts.push(`${stats.imageCount} image${stats.imageCount !== 1 ? 's' : ''}`);
  }
  if (stats.pageCount > 1) {
    parts.push(`${stats.pageCount} pages`);
  }

  return parts.join(' | ');
}

/**
 * Apply all text transforms in the recommended order
 */
export function applyAllTransforms(
  text: string,
  options: {
    fixHyphenation?: boolean;
    defragmentLines?: boolean;
    mergeBullets?: boolean;
  } = {}
): string {
  let result = text;

  // 1. Fix hyphenation (before other transforms to get proper words)
  if (options.fixHyphenation !== false) {
    result = fixHyphenationAdvanced(result);
  }

  // 2. Merge standalone bullets
  if (options.mergeBullets !== false) {
    result = mergeBulletLines(result);
  }

  // 3. Defragment lines (last, after other cleanup)
  if (options.defragmentLines !== false) {
    result = defragmentLines(result);
  }

  return result;
}
