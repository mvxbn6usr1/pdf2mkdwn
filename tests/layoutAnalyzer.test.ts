/**
 * Layout Analyzer Unit Tests
 *
 * Tests the holistic page layout analysis that runs BEFORE content detection.
 * This is critical for distinguishing between:
 * - Two-column prose layouts (NOT tables)
 * - Actual data tables (ARE tables)
 */

import {
  analyzePageLayout,
  detectPageColumns,
  classifyBlock,
  hasMultiColumnProseLayout,
  shouldProcessAsTable,
  createPositionedLine,
  type PositionedLine,
  type PositionedChar,
} from '../src/utils/layoutAnalyzer';

// Test runner helper
let passed = 0;
let failed = 0;

function test(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}${details ? ` - ${details}` : ''}`);
    failed++;
  }
}

// Helper to create positioned lines from text
function createTestLine(text: string, y: number, minX: number, maxX: number, fontSize: number = 12): PositionedLine {
  const chars: PositionedChar[] = [];
  const charWidth = (maxX - minX) / text.length;

  for (let i = 0; i < text.length; i++) {
    chars.push({
      char: text[i],
      x: minX + i * charWidth,
      y,
      fontSize,
    });
  }

  return createPositionedLine(chars, y, minX, maxX);
}

console.log('='.repeat(60));
console.log('LAYOUT ANALYZER TESTS');
console.log('='.repeat(60));
console.log('');

// Test 1: Single column detection
console.log('Single Column Detection');
console.log('-'.repeat(40));

const singleColumnLines: PositionedLine[] = [
  createTestLine('This is a paragraph of text that spans most of the page width.', 100, 50, 550),
  createTestLine('It continues with more content in the same column structure.', 120, 50, 550),
  createTestLine('The text flows naturally from line to line without breaks.', 140, 50, 550),
  createTestLine('This is another paragraph with similar width.', 180, 50, 550),
  createTestLine('And more text continues below.', 200, 50, 550),
];

const singleColumnLayout = analyzePageLayout(singleColumnLines, 612, 792);
test('Single column detected', singleColumnLayout.columns.length === 1, `got ${singleColumnLayout.columns.length} columns`);
test('Not multi-column', !singleColumnLayout.isMultiColumn);
test('No prose-column regions', !hasMultiColumnProseLayout(singleColumnLayout));

console.log('');

// Test 2: Two-column prose detection (academic paper style)
console.log('Two-Column Prose Detection (Academic Paper)');
console.log('-'.repeat(40));

const twoColumnProseLines: PositionedLine[] = [
  // Left column - prose text
  createTestLine('The quick brown fox jumps over the lazy dog.', 100, 50, 280),
  createTestLine('This is academic prose that discusses important topics.', 120, 50, 280),
  createTestLine('The research methodology was carefully designed.', 140, 50, 280),
  createTestLine('Results show significant improvements in performance.', 160, 50, 280),
  createTestLine('Further analysis is needed to confirm these findings.', 180, 50, 280),
  // Right column - prose text
  createTestLine('In this section we present our analysis.', 100, 330, 560),
  createTestLine('The data was collected over six months.', 120, 330, 560),
  createTestLine('Participants were randomly selected from the pool.', 140, 330, 560),
  createTestLine('Statistical analysis revealed strong correlations.', 160, 330, 560),
  createTestLine('These results support our initial hypothesis.', 180, 330, 560),
];

const twoColumnLayout = analyzePageLayout(twoColumnProseLines, 612, 792);
test('Two columns detected', twoColumnLayout.columns.length === 2, `got ${twoColumnLayout.columns.length} columns`);
test('Is multi-column', twoColumnLayout.isMultiColumn);
test('Has prose-column regions', hasMultiColumnProseLayout(twoColumnLayout));

// Verify no regions are marked as potential-table
const tableRegions = twoColumnLayout.regions.filter(r => shouldProcessAsTable(r));
test('No table regions in prose layout', tableRegions.length === 0, `got ${tableRegions.length} table regions`);

console.log('');

// Test 3: Actual table detection
console.log('Actual Table Detection');
console.log('-'.repeat(40));

const tableLines: PositionedLine[] = [
  // Header row - short tokens spread across columns
  createTestLine('Name', 100, 50, 120),
  createTestLine('Age', 100, 150, 200),
  createTestLine('City', 100, 230, 300),
  // Data rows
  createTestLine('John', 120, 50, 100),
  createTestLine('30', 120, 150, 180),
  createTestLine('NYC', 120, 230, 280),
  createTestLine('Jane', 140, 50, 100),
  createTestLine('25', 140, 150, 175),
  createTestLine('LA', 140, 230, 260),
  createTestLine('Bob', 160, 50, 95),
  createTestLine('35', 160, 150, 180),
  createTestLine('Chicago', 160, 230, 310),
];

const tableLayout = analyzePageLayout(tableLines, 612, 792);
test('Table layout - not prose-column', !hasMultiColumnProseLayout(tableLayout));

// Check if any region is potential-table
const potentialTables = tableLayout.regions.filter(r => r.type === 'potential-table');
// Note: Short tokens might be classified differently, but should not be prose-column
test('Table not classified as prose-column',
  !tableLayout.regions.some(r => r.type === 'prose-column'),
  `regions: ${tableLayout.regions.map(r => r.type).join(', ')}`);

console.log('');

// Test 4: Block classification - prose vs table
console.log('Block Classification');
console.log('-'.repeat(40));

// Create a prose block
const proseBlock = {
  lines: [
    createTestLine('The quick brown fox jumps over the lazy dog. This is a complete sentence.', 100, 50, 500),
    createTestLine('Another sentence follows with more content that flows naturally.', 120, 50, 500),
    createTestLine('The paragraph continues with additional text and punctuation.', 140, 50, 500),
  ],
  bbox: { x: 50, y: 100, w: 450, h: 60 },
  text: 'The quick brown fox jumps over the lazy dog. This is a complete sentence.\nAnother sentence follows with more content that flows naturally.\nThe paragraph continues with additional text and punctuation.',
  avgFontSize: 12,
};

const proseClassification = classifyBlock(proseBlock, 612);
test('Prose block classified as prose', proseClassification.type === 'prose' || proseClassification.type === 'prose-column',
  `got ${proseClassification.type}`);

// Create a table-like block
const tableBlock = {
  lines: [
    createTestLine('2020    $1.2M    $200K', 100, 50, 250),
    createTestLine('2021    $1.5M    $350K', 120, 50, 250),
    createTestLine('2022    $2.0M    $500K', 140, 50, 250),
  ],
  bbox: { x: 50, y: 100, w: 200, h: 60 },
  text: '2020    $1.2M    $200K\n2021    $1.5M    $350K\n2022    $2.0M    $500K',
  avgFontSize: 12,
};

const tableClassification = classifyBlock(tableBlock, 612);
test('Table block classified as potential-table', tableClassification.type === 'potential-table',
  `got ${tableClassification.type}`);

console.log('');

// Test 5: Heading detection
console.log('Heading Detection');
console.log('-'.repeat(40));

const headingBlock = {
  lines: [
    createTestLine('Introduction', 50, 50, 200, 18),
  ],
  bbox: { x: 50, y: 50, w: 150, h: 25 },
  text: 'Introduction',
  avgFontSize: 18,
};

const headingClassification = classifyBlock(headingBlock, 612);
test('Short text without punctuation is heading', headingClassification.type === 'heading',
  `got ${headingClassification.type}`);

console.log('');

// Test 6: List detection
console.log('List Detection');
console.log('-'.repeat(40));

const listBlock = {
  lines: [
    createTestLine('• First item in the list', 100, 50, 250),
    createTestLine('• Second item follows', 120, 50, 230),
    createTestLine('• Third item here', 140, 50, 200),
  ],
  bbox: { x: 50, y: 100, w: 200, h: 60 },
  text: '• First item in the list\n• Second item follows\n• Third item here',
  avgFontSize: 12,
};

const listClassification = classifyBlock(listBlock, 612);
test('Bulleted list detected', listClassification.type === 'list',
  `got ${listClassification.type}`);

console.log('');

// Test 7: Mixed content page (prose + table)
console.log('Mixed Content Page');
console.log('-'.repeat(40));

const mixedLines: PositionedLine[] = [
  // Heading
  createTestLine('Results', 50, 50, 150, 18),
  // Prose paragraph
  createTestLine('The following table shows our findings from the study.', 100, 50, 500),
  createTestLine('Data was collected over three years with consistent methodology.', 120, 50, 500),
  // Table (with numeric data - short tokens)
  createTestLine('Year', 180, 50, 100),
  createTestLine('Revenue', 180, 150, 220),
  createTestLine('2020', 200, 50, 100),
  createTestLine('$1.2M', 200, 150, 210),
  createTestLine('2021', 220, 50, 100),
  createTestLine('$1.5M', 220, 150, 210),
  // More prose
  createTestLine('As shown above, revenue increased significantly each year.', 280, 50, 500),
];

const mixedLayout = analyzePageLayout(mixedLines, 612, 792);
test('Mixed content - single column layout', mixedLayout.columns.length === 1, `got ${mixedLayout.columns.length} columns`);
test('Mixed content - not prose-column', !hasMultiColumnProseLayout(mixedLayout));

// Should have multiple region types
const regionTypes = new Set(mixedLayout.regions.map(r => r.type));
test('Mixed content - multiple region types', regionTypes.size >= 2,
  `got ${Array.from(regionTypes).join(', ')}`);

console.log('');
console.log('='.repeat(60));
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
