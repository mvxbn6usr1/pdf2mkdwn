import * as mupdf from 'mupdf';
import { createWorker, type Worker } from 'tesseract.js';
import type { PageResult, ProcessingOptions, ExtractedImage } from '../types';
import {
  enhanceWithVision,
  fullAnalysis,
  hybridAnalysis,
  canvasToBase64,
  getDocumentStructure,
  extractImageRegions,
} from './visionProcessor';

let tesseractWorker: Worker | null = null;

async function getOCRWorker(language: string): Promise<Worker> {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker(language);
  }
  return tesseractWorker;
}

export async function terminateOCRWorker(): Promise<void> {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}

// MuPDF structured text JSON types
interface StructuredTextBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface StructuredTextFont {
  name: string;
  family: string;
  weight: string;
  style: string;
  size: number;
}

interface StructuredTextLine {
  wmode: number;
  bbox: StructuredTextBbox;
  font: StructuredTextFont;
  x: number;
  y: number;
  text: string;
}

interface StructuredTextBlock {
  type: string;
  bbox: StructuredTextBbox;
  lines?: StructuredTextLine[];
}

interface StructuredTextPage {
  blocks: StructuredTextBlock[];
}

interface ProcessedLine {
  text: string;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  fontFamily: string;
}

/**
 * Analyze font sizes to determine body text size and header thresholds
 */
function analyzeFontSizes(lines: ProcessedLine[]): { bodySize: number; h1Min: number; h2Min: number; h3Min: number } {
  // Count occurrences of each font size (rounded to nearest 0.5)
  const sizeCounts = new Map<number, number>();

  for (const line of lines) {
    const roundedSize = Math.round(line.fontSize * 2) / 2;
    sizeCounts.set(roundedSize, (sizeCounts.get(roundedSize) || 0) + line.text.length);
  }

  // Find the most common size (by character count) - this is likely body text
  let bodySize = 12; // default
  let maxCount = 0;

  for (const [size, count] of sizeCounts) {
    if (count > maxCount) {
      maxCount = count;
      bodySize = size;
    }
  }

  // Define header thresholds relative to body size
  return {
    bodySize,
    h1Min: bodySize * 1.5,  // 50% larger = h1
    h2Min: bodySize * 1.25, // 25% larger = h2
    h3Min: bodySize * 1.1,  // 10% larger = h3
  };
}

/**
 * Determine heading level based on font size
 */
function getHeadingLevel(fontSize: number, thresholds: { bodySize: number; h1Min: number; h2Min: number; h3Min: number }): number {
  if (fontSize >= thresholds.h1Min) return 1;
  if (fontSize >= thresholds.h2Min) return 2;
  if (fontSize >= thresholds.h3Min) return 3;
  return 0; // Not a heading
}

/**
 * Check if text looks like a list item
 */
function isListItem(text: string): { type: 'bullet' | 'number' | null; content: string } {
  const bulletMatch = text.match(/^[\u2022\u2023\u25E6\u2043\u2219•◦‣⁃●○]\s*/);
  if (bulletMatch) {
    return { type: 'bullet', content: text.slice(bulletMatch[0].length) };
  }
  const numberMatch = text.match(/^(\d+)[\.\)]\s+/);
  if (numberMatch) {
    return { type: 'number', content: text };
  }
  return { type: null, content: text };
}

/**
 * Analyze a block to determine its dominant characteristics
 */
function analyzeBlock(lines: StructuredTextLine[], thresholds: { bodySize: number; h1Min: number; h2Min: number; h3Min: number }): {
  isHeading: boolean;
  headingLevel: number;
  isBold: boolean;
  isItalic: boolean;
  avgFontSize: number;
} {
  if (lines.length === 0) {
    return { isHeading: false, headingLevel: 0, isBold: false, isItalic: false, avgFontSize: 12 };
  }

  let totalSize = 0;
  let boldCount = 0;
  let italicCount = 0;
  let totalChars = 0;

  for (const line of lines) {
    const charCount = (line.text || '').length;
    totalChars += charCount;
    totalSize += (line.font?.size || 12) * charCount;

    const isBold = line.font?.weight === 'bold' || (line.font?.name || '').toLowerCase().includes('bold');
    const isItalic = line.font?.style === 'italic' || (line.font?.name || '').toLowerCase().includes('italic');

    if (isBold) boldCount += charCount;
    if (isItalic) italicCount += charCount;
  }

  const avgFontSize = totalChars > 0 ? totalSize / totalChars : 12;
  const headingLevel = getHeadingLevel(avgFontSize, thresholds);

  return {
    isHeading: headingLevel > 0,
    headingLevel,
    isBold: boldCount > totalChars * 0.5, // More than 50% bold
    isItalic: italicCount > totalChars * 0.5, // More than 50% italic
    avgFontSize,
  };
}

/**
 * Check if text ends with sentence-ending punctuation
 */
function endsWithTerminalPunctuation(text: string): boolean {
  const trimmed = text.trim();
  // Check for sentence-ending punctuation, including after quotes/parentheses
  return /[.!?:]["'\u201C\u201D\u2018\u2019)]*\s*$/.test(trimmed) ||
    // Also treat lines ending with these as terminal
    /["\u201D]\s*$/.test(trimmed);
}

/**
 * Check if text starts in a way that suggests it's a continuation
 */
function startsAsContinuation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Starts with lowercase letter - likely a continuation
  if (/^[a-z]/.test(trimmed)) return true;

  // Starts with certain punctuation that suggests continuation
  if (/^[,;:\-\u2013\u2014]/.test(trimmed)) return true;

  // Starts with closing quote/parenthesis
  if (/^["\u201D\u2019)\]]/.test(trimmed)) return true;

  return false;
}

/**
 * Check if text starts with a label pattern that suggests it's a distinct item
 * Examples: "Gaza:", "Israel:", "USA:", "Note:", "Warning:", etc.
 */
function startsWithLabelPattern(text: string): boolean {
  const trimmed = text.trim();
  // Pattern: One or more capitalized words followed by colon, then content
  // e.g., "Gaza: Body of hostage..." or "United States: ..."
  return /^[A-Z][A-Za-z]*(\s+[A-Z][A-Za-z]*)*:\s/.test(trimmed);
}

/**
 * Check if text looks like a complete thought (ends with content word, not connector)
 */
function endsWithCompleteThought(text: string): boolean {
  const trimmed = text.trim();

  // If it ends with terminal punctuation, it's complete
  if (/[.!?]["'\u201C\u201D\u2018\u2019)]*\s*$/.test(trimmed)) {
    return true;
  }

  // Check if it ends with a word that typically completes a phrase
  // (nouns, verbs in past tense, adjectives) rather than connectors
  const lastWord = trimmed.split(/\s+/).pop()?.toLowerCase() || '';

  // Words that suggest incomplete thought - need continuation
  const incompleteEndings = [
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
    'with', 'that', 'this', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'by', 'from', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'under', 'over', 'such', 'as', 'if', 'when', 'where', 'while', 'although',
    'because', 'since', 'unless', 'whether', 'which', 'who', 'whom', 'whose',
    'their', 'its', 'his', 'her', 'our', 'your', 'my', 'these', 'those'
  ];

  return !incompleteEndings.includes(lastWord);
}

/**
 * Calculate the average line height for a block
 */
function getBlockLineHeight(block: StructuredTextBlock): number {
  if (!block.lines || block.lines.length < 2) {
    return block.bbox?.h || 12;
  }

  let totalGap = 0;
  let gapCount = 0;

  for (let i = 1; i < block.lines.length; i++) {
    const prevLine = block.lines[i - 1];
    const currLine = block.lines[i];
    const gap = currLine.y - prevLine.y;
    if (gap > 0) {
      totalGap += gap;
      gapCount++;
    }
  }

  return gapCount > 0 ? totalGap / gapCount : (block.lines[0].font?.size || 12) * 1.2;
}

/**
 * Determine if two blocks should be merged into the same paragraph
 */
function shouldMergeBlocks(
  prevBlock: StructuredTextBlock,
  currBlock: StructuredTextBlock,
  prevText: string,
  currText: string,
  avgLineHeight: number
): boolean {
  // Don't merge if current text starts with a label pattern (e.g., "Gaza:", "Israel:")
  // These are typically distinct items/headlines
  if (startsWithLabelPattern(currText)) {
    return false;
  }

  // Don't merge if previous text ends with terminal punctuation AND current starts with capital
  if (endsWithTerminalPunctuation(prevText) && /^[A-Z]/.test(currText.trim())) {
    return false;
  }

  // Don't merge if previous text looks like a complete thought and current starts with capital
  if (endsWithCompleteThought(prevText) && /^[A-Z]/.test(currText.trim())) {
    return false;
  }

  // Merge if current block starts as a continuation (lowercase, punctuation, etc.)
  if (startsAsContinuation(currText)) {
    return true;
  }

  // At this point, previous doesn't end with complete thought or terminal punctuation
  // Check vertical spacing - if blocks are close AND previous is incomplete, merge
  if (!endsWithCompleteThought(prevText)) {
    const prevBottom = (prevBlock.bbox?.y || 0) + (prevBlock.bbox?.h || 0);
    const currTop = currBlock.bbox?.y || 0;
    const verticalGap = currTop - prevBottom;

    // If gap is less than ~1.5x line height and previous is incomplete, likely same paragraph
    if (verticalGap < avgLineHeight * 1.5) {
      return true;
    }
  }

  return false;
}

/**
 * Convert structured text to Markdown using font information
 */
function structuredTextToMarkdown(json: string, preserveLayout: boolean): string {
  const data: StructuredTextPage = JSON.parse(json);

  // Sort blocks by vertical position (top to bottom) for correct reading order
  const sortedBlocks = [...data.blocks]
    .filter(b => b.type === 'text' && b.lines && b.lines.length > 0)
    .sort((a, b) => {
      // Sort by y position (top of block)
      const aY = a.bbox?.y ?? 0;
      const bY = b.bbox?.y ?? 0;
      return aY - bY;
    });

  // First pass: collect all lines with their font info for analysis
  const allLines: ProcessedLine[] = [];
  for (const block of sortedBlocks) {
    if (block.lines) {
      for (const line of block.lines) {
        if (line.text && line.text.trim()) {
          allLines.push({
            text: line.text.trim(),
            fontSize: line.font?.size || 12,
            isBold: line.font?.weight === 'bold' || (line.font?.name || '').toLowerCase().includes('bold'),
            isItalic: line.font?.style === 'italic' || (line.font?.name || '').toLowerCase().includes('italic'),
            fontFamily: line.font?.family || 'serif',
          });
        }
      }
    }
  }

  // Analyze font sizes to determine thresholds
  const thresholds = analyzeFontSizes(allLines);

  // Calculate average line height across all blocks for spacing analysis
  let totalLineHeight = 0;
  let lineHeightCount = 0;
  for (const block of sortedBlocks) {
    const lh = getBlockLineHeight(block);
    totalLineHeight += lh;
    lineHeightCount++;
  }
  const avgLineHeight = lineHeightCount > 0 ? totalLineHeight / lineHeightCount : 12;

  // Second pass: process blocks and merge where appropriate
  interface ProcessedBlock {
    text: string;
    isHeading: boolean;
    headingLevel: number;
    isBold: boolean;
    isItalic: boolean;
    isList: boolean;
    block: StructuredTextBlock;
  }

  const processedBlocks: ProcessedBlock[] = [];

  for (const block of sortedBlocks) {
    if (!block.lines || block.lines.length === 0) continue;

    const validLines = block.lines.filter(l => l.text && l.text.trim());
    if (validLines.length === 0) continue;

    // Check if first line is a list item
    const firstLineText = validLines[0].text.trim();
    const listCheck = isListItem(firstLineText);

    if (listCheck.type) {
      // Process as list items - each line is a separate item
      for (const line of validLines) {
        const text = line.text.trim();
        const item = isListItem(text);
        let listText: string;
        if (item.type === 'bullet') {
          listText = `- ${item.content}`;
        } else if (item.type === 'number') {
          listText = text.replace(/^(\d+)[\.\)]\s+/, '$1. ');
        } else {
          listText = text;
        }
        processedBlocks.push({
          text: listText,
          isHeading: false,
          headingLevel: 0,
          isBold: false,
          isItalic: false,
          isList: true,
          block,
        });
      }
      continue;
    }

    // Analyze the block as a whole
    const blockAnalysis = analyzeBlock(validLines, thresholds);

    // Smart line joining within block - check if lines should be kept separate
    const lineGroups: string[][] = [[]];

    for (let i = 0; i < validLines.length; i++) {
      const currText = validLines[i].text.trim();
      const prevText = i > 0 ? validLines[i - 1].text.trim() : '';

      // Determine if this line should start a new group
      let startNewGroup = false;

      if (i > 0) {
        // Start new group if current line has a label pattern (e.g., "Gaza:", "Israel:")
        if (startsWithLabelPattern(currText)) {
          startNewGroup = true;
        }
        // Start new group if previous line ends with complete thought and current starts with capital
        else if (endsWithCompleteThought(prevText) && /^[A-Z]/.test(currText)) {
          startNewGroup = true;
        }
        // Start new group if previous ends with terminal punctuation and current starts with capital
        else if (endsWithTerminalPunctuation(prevText) && /^[A-Z]/.test(currText)) {
          startNewGroup = true;
        }
      }

      if (startNewGroup) {
        lineGroups.push([currText]);
      } else {
        lineGroups[lineGroups.length - 1].push(currText);
      }
    }

    // Create a processed block for each line group
    for (const group of lineGroups) {
      if (group.length === 0) continue;

      const groupText = group.join(' ');

      processedBlocks.push({
        text: groupText,
        isHeading: blockAnalysis.isHeading,
        headingLevel: blockAnalysis.headingLevel,
        isBold: blockAnalysis.isBold,
        isItalic: blockAnalysis.isItalic,
        isList: false,
        block,
      });
    }
  }

  // Third pass: merge consecutive non-heading, non-list blocks that should be combined
  const mergedParagraphs: string[] = [];
  let currentParagraph: string[] = [];
  let currentFormatting: { isBold: boolean; isItalic: boolean } | null = null;

  for (let i = 0; i < processedBlocks.length; i++) {
    const curr = processedBlocks[i];
    const prev = i > 0 ? processedBlocks[i - 1] : null;

    // Headings and list items are never merged
    if (curr.isHeading) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        let text = currentParagraph.join(' ');
        if (currentFormatting?.isBold && currentFormatting?.isItalic) {
          text = `***${text}***`;
        } else if (currentFormatting?.isBold) {
          text = `**${text}**`;
        } else if (currentFormatting?.isItalic) {
          text = `*${text}*`;
        }
        mergedParagraphs.push(text);
        currentParagraph = [];
        currentFormatting = null;
      }

      const prefix = '#'.repeat(curr.headingLevel);
      mergedParagraphs.push(`${prefix} ${curr.text}`);
      continue;
    }

    if (curr.isList) {
      // Flush current paragraph
      if (currentParagraph.length > 0) {
        let text = currentParagraph.join(' ');
        if (currentFormatting?.isBold && currentFormatting?.isItalic) {
          text = `***${text}***`;
        } else if (currentFormatting?.isBold) {
          text = `**${text}**`;
        } else if (currentFormatting?.isItalic) {
          text = `*${text}*`;
        }
        mergedParagraphs.push(text);
        currentParagraph = [];
        currentFormatting = null;
      }

      mergedParagraphs.push(curr.text);
      continue;
    }

    // Regular paragraph block - check if we should merge with previous
    const shouldMerge = prev &&
      !prev.isHeading &&
      !prev.isList &&
      !curr.isHeading &&
      !curr.isList &&
      shouldMergeBlocks(prev.block, curr.block, prev.text, curr.text, avgLineHeight);

    if (shouldMerge && currentParagraph.length > 0) {
      // Continue building current paragraph
      currentParagraph.push(curr.text);
    } else {
      // Start new paragraph - flush previous if any
      if (currentParagraph.length > 0) {
        let text = currentParagraph.join(' ');
        if (currentFormatting?.isBold && currentFormatting?.isItalic) {
          text = `***${text}***`;
        } else if (currentFormatting?.isBold) {
          text = `**${text}**`;
        } else if (currentFormatting?.isItalic) {
          text = `*${text}*`;
        }
        mergedParagraphs.push(text);
      }

      currentParagraph = [curr.text];
      currentFormatting = { isBold: curr.isBold, isItalic: curr.isItalic };
    }
  }

  // Flush final paragraph
  if (currentParagraph.length > 0) {
    let text = currentParagraph.join(' ');
    if (currentFormatting?.isBold && currentFormatting?.isItalic) {
      text = `***${text}***`;
    } else if (currentFormatting?.isBold) {
      text = `**${text}**`;
    } else if (currentFormatting?.isItalic) {
      text = `*${text}*`;
    }
    mergedParagraphs.push(text);
  }

  let markdown = mergedParagraphs.join('\n\n');

  // Clean up multiple consecutive newlines
  if (!preserveLayout) {
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
  }

  return markdown.trim();
}

/**
 * Fallback: Convert plain text to Markdown (for OCR output)
 */
function plainTextToMarkdown(text: string, preserveLayout: boolean): string {
  const lines = text.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (preserveLayout || processedLines.length === 0 || processedLines[processedLines.length - 1] !== '') {
        processedLines.push('');
      }
      continue;
    }

    // Detect bullet points
    if (line.match(/^[\u2022\u2023\u25E6\u2043\u2219•◦‣⁃●○]\s*/)) {
      processedLines.push(`- ${line.replace(/^[\u2022\u2023\u25E6\u2043\u2219•◦‣⁃●○]\s*/, '')}`);
      continue;
    }

    // Detect numbered lists
    if (line.match(/^\d+[\.\)]\s+/)) {
      processedLines.push(line.replace(/^(\d+)[\.\)]\s+/, '$1. '));
      continue;
    }

    processedLines.push(line);
  }

  let markdown = processedLines.join('\n');

  if (!preserveLayout) {
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
  }

  return markdown.trim();
}

/**
 * Render a page to canvas for OCR fallback
 */
function renderPageToCanvas(
  page: mupdf.Page,
  scale: number = 2.0
): HTMLCanvasElement {
  const bounds = page.getBounds();
  const width = Math.floor((bounds[2] - bounds[0]) * scale);
  const height = Math.floor((bounds[3] - bounds[1]) * scale);

  const pixmap = page.toPixmap(
    mupdf.Matrix.scale(scale, scale),
    mupdf.ColorSpace.DeviceRGB,
    false
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const pixels = pixmap.getPixels();
  const imageData = ctx.createImageData(pixmap.getWidth(), pixmap.getHeight());

  // Convert RGB to RGBA
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    imageData.data[j] = pixels[i];       // R
    imageData.data[j + 1] = pixels[i + 1]; // G
    imageData.data[j + 2] = pixels[i + 2]; // B
    imageData.data[j + 3] = 255;           // A
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

async function performOCR(
  canvas: HTMLCanvasElement,
  language: string
): Promise<string> {
  const worker = await getOCRWorker(language);
  const { data: { text } } = await worker.recognize(canvas);
  return text;
}

export async function processPDFPage(
  doc: mupdf.Document,
  pageIndex: number,
  options: ProcessingOptions
): Promise<PageResult> {
  const page = doc.loadPage(pageIndex);

  // Get structured text from MuPDF
  const structuredText = page.toStructuredText('preserve-whitespace');
  let markdown = '';
  let hasImages = false;
  let extractedImagesList: ExtractedImage[] = [];

  // Try to extract text using asText() first to check if there's content
  const simpleText = structuredText.asText();

  if (simpleText.trim().length > 0) {
    // Use structured JSON for proper markdown conversion with font info
    const json = structuredText.asJSON();
    markdown = structuredTextToMarkdown(json, options.preserveLayout);
  }

  // If no text found or OCR is enabled, use OCR as fallback
  if ((!markdown.trim() || options.ocrEnabled) && options.ocrEnabled) {
    const canvas = renderPageToCanvas(page);
    const ocrText = await performOCR(canvas, options.language);
    markdown = plainTextToMarkdown(ocrText, options.preserveLayout);
    hasImages = true;
  }

  // If Vision AI is enabled, enhance the output with image descriptions and better structure
  if (options.useVisionAI && options.visionAPIKey) {
    try {
      const canvas = renderPageToCanvas(page, 1.5);
      const imageBase64 = canvasToBase64(canvas);

      if (options.visionMode === 'full') {
        // Full mode: multi-call layout analysis (replaces MuPDF text)
        markdown = await fullAnalysis(imageBase64, options.visionAPIKey);
      } else if (options.visionMode === 'hybrid') {
        // Hybrid mode: keeps MuPDF text, extracts actual images, adds descriptions
        // First get document structure to know where images are
        const structure = await getDocumentStructure(imageBase64, options.visionAPIKey);

        // Extract actual image regions from the rendered page
        const extractedImagesMap = extractImageRegions(canvas, structure.images);

        console.log('pdfProcessor: extracted', extractedImagesMap.size, 'images from page', pageIndex + 1);

        // Merge MuPDF text with extracted images and descriptions
        const hybridResult = await hybridAnalysis(
          markdown,
          imageBase64,
          options.visionAPIKey,
          extractedImagesMap,
          structure,
          pageIndex + 1
        );
        markdown = hybridResult.markdown;
        extractedImagesList = hybridResult.images;
        hasImages = extractedImagesMap.size > 0;
      } else {
        // Quick mode: single API call (replaces MuPDF text)
        markdown = await enhanceWithVision(markdown, imageBase64, options.visionAPIKey);
      }
      if (!hasImages) hasImages = true;
    } catch (error) {
      console.warn('Vision AI processing failed for page', pageIndex + 1, error);
      // Continue with MuPDF/OCR output
    }
  }

  return {
    pageNumber: pageIndex + 1,
    text: markdown,
    hasImages,
    extractedImages: extractedImagesList,
  };
}

export async function loadPDF(file: File): Promise<mupdf.Document> {
  const arrayBuffer = await file.arrayBuffer();
  const doc = mupdf.Document.openDocument(arrayBuffer, 'application/pdf');
  return doc;
}

export interface ProcessPDFResult {
  markdown: string;
  extractedImages: ExtractedImage[];
}

export async function processPDF(
  file: File,
  options: ProcessingOptions,
  onProgress?: (current: number, total: number) => void
): Promise<ProcessPDFResult> {
  const doc = await loadPDF(file);
  const totalPages = doc.countPages();
  const pageResults: PageResult[] = [];

  for (let i = 0; i < totalPages; i++) {
    const result = await processPDFPage(doc, i, options);
    pageResults.push(result);
    onProgress?.(i + 1, totalPages);
  }

  // Combine all pages into a single markdown document
  // Join with double newlines - no page markers to preserve document flow
  const markdown = pageResults
    .map((result) => result.text)
    .filter((text) => text.trim())
    .join('\n\n');

  // Combine all extracted images from all pages
  const extractedImages = pageResults.flatMap((result) => result.extractedImages || []);

  return { markdown, extractedImages };
}

export async function getPDFPageCount(file: File): Promise<number> {
  const doc = await loadPDF(file);
  return doc.countPages();
}

export async function renderPDFPagePreview(
  file: File,
  pageNumber: number,
  scale: number = 1.5
): Promise<string> {
  const doc = await loadPDF(file);
  const page = doc.loadPage(pageNumber - 1);
  const canvas = renderPageToCanvas(page, scale);
  return canvas.toDataURL('image/png');
}
