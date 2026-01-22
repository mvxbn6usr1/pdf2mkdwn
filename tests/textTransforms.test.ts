/**
 * Text Transforms Unit Tests
 *
 * Tests header/footer detection, hyphenation repair, line defragmentation,
 * bullet merging, and statistics calculation.
 */

import {
  detectHeaderFooterPatterns,
  matchesHeaderFooterPattern,
  removeHeadersFooters,
  fixHyphenation,
  fixHyphenationAdvanced,
  defragmentLines,
  mergeBulletLines,
  calculateStats,
  formatStats,
  applyAllTransforms,
  type PageLines,
} from '../src/utils/textTransforms';

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

console.log('='.repeat(60));
console.log('TEXT TRANSFORMS TESTS');
console.log('='.repeat(60));
console.log('');

// Test 1: Hyphenation Repair
console.log('Hyphenation Repair');
console.log('-'.repeat(40));

const hyphenationTests = [
  {
    input: 'This is a com-\nprehensive test.',
    expected: 'This is a comprehensive test.',
    name: 'Basic hyphenation fix',
  },
  {
    input: 'The docu-\nment was re-\nviewed.',
    expected: 'The document was reviewed.',
    name: 'Multiple hyphenations',
  },
  {
    input: 'self-contained text',
    expected: 'self-contained text',
    name: 'Preserve intentional hyphens',
  },
  {
    input: 'Line one.\nLine two.',
    expected: 'Line one.\nLine two.',
    name: 'Preserve regular line breaks',
  },
  {
    input: 'Extra-\n   ordinary',
    expected: 'Extraordinary',
    name: 'Fix with extra whitespace',
  },
];

for (const { input, expected, name } of hyphenationTests) {
  const result = fixHyphenation(input);
  test(name, result === expected, `got "${result}", expected "${expected}"`);
}

console.log('');

// Test 2: Line Defragmentation
console.log('Line Defragmentation');
console.log('-'.repeat(40));

const defragTests = [
  {
    input: 'This is a long sentence that was\nbroken incorrectly',
    name: 'Join short continuation',
    checkContains: 'sentence that was broken',
  },
  {
    input: '# Heading\nParagraph text',
    name: 'Preserve heading separation',
    checkNotContains: 'Heading Paragraph',
  },
  {
    input: '- List item\nNext item',
    name: 'Preserve list structure',
    checkContains: '- List item',
  },
  {
    input: 'Complete sentence.\nNew sentence here.',
    name: 'Preserve separate sentences',
    checkNotContains: 'sentence. New sentence',
  },
];

for (const { input, name, checkContains, checkNotContains } of defragTests) {
  const result = defragmentLines(input);
  if (checkContains) {
    test(name, result.includes(checkContains), `should contain "${checkContains}", got "${result}"`);
  }
  if (checkNotContains) {
    test(name, !result.includes(checkNotContains), `should not contain "${checkNotContains}", got "${result}"`);
  }
}

console.log('');

// Test 3: Bullet Line Merging
console.log('Bullet Line Merging');
console.log('-'.repeat(40));

const bulletTests = [
  {
    input: '•\nFirst item text',
    expected: '- First item text',
    name: 'Merge standalone bullet with text',
  },
  {
    input: '-\nItem one\n-\nItem two',
    expected: '- Item one\n- Item two',
    name: 'Multiple standalone bullets',
  },
  {
    input: '• Complete item\n• Another item',
    expected: '• Complete item\n• Another item',
    name: 'Preserve complete bullet items',
  },
];

for (const { input, expected, name } of bulletTests) {
  const result = mergeBulletLines(input);
  test(name, result === expected, `got "${result}", expected "${expected}"`);
}

console.log('');

// Test 4: Header/Footer Detection
console.log('Header/Footer Detection');
console.log('-'.repeat(40));

// Simulate multi-page document with repeating headers/footers
const pageLines: PageLines[] = [
  { pageNumber: 1, firstLines: ['Document Title', 'Chapter 1'], lastLines: ['Page 1', 'Footer text'] },
  { pageNumber: 2, firstLines: ['Document Title', 'Section 2.1'], lastLines: ['Page 2', 'Footer text'] },
  { pageNumber: 3, firstLines: ['Document Title', 'Section 2.2'], lastLines: ['Page 3', 'Footer text'] },
  { pageNumber: 4, firstLines: ['Document Title', 'Section 3.1'], lastLines: ['Page 4', 'Footer text'] },
  { pageNumber: 5, firstLines: ['Document Title', 'Conclusion'], lastLines: ['Page 5', 'Footer text'] },
];

const patterns = detectHeaderFooterPatterns(pageLines);

test('Detect repeating header', patterns.headers.length > 0, `found ${patterns.headers.length} headers`);
test('Detect repeating footer', patterns.footers.length > 0, `found ${patterns.footers.length} footers`);

// Test matching
const headerMatch = matchesHeaderFooterPattern('document title', patterns.headers);
test('Match header pattern', headerMatch === true);

const nonMatch = matchesHeaderFooterPattern('Random unique content', patterns.headers);
test('Non-matching text', nonMatch === false);

// Test removal
const textWithHeaderFooter = `Document Title
This is the content.
More content here.
Footer text`;

const cleanedText = removeHeadersFooters(textWithHeaderFooter, patterns.headers, patterns.footers);
test('Remove header from text', !cleanedText.toLowerCase().includes('document title'));
test('Remove footer from text', !cleanedText.toLowerCase().includes('footer text'));
test('Preserve content', cleanedText.includes('content'));

console.log('');

// Test 5: Statistics Calculation
console.log('Statistics Calculation');
console.log('-'.repeat(40));

const markdownSample = `# Main Heading

This is a paragraph with some text. It contains multiple sentences and words.

## Subheading

| Column A | Column B |
|----------|----------|
| Data 1 | Data 2 |
| Data 3 | Data 4 |

- List item one
- List item two
- List item three

![Image description](image.png)

More paragraph text here.`;

const stats = calculateStats(markdownSample, 3);

test('Count headings', stats.headingCount === 2, `got ${stats.headingCount}`);
test('Count tables', stats.tableCount === 1, `got ${stats.tableCount}`);
test('Count list items', stats.listItemCount === 3, `got ${stats.listItemCount}`);
test('Count images', stats.imageCount === 1, `got ${stats.imageCount}`);
test('Count pages', stats.pageCount === 3, `got ${stats.pageCount}`);
test('Word count > 0', stats.wordCount > 0, `got ${stats.wordCount}`);

// Test formatStats
const formatted = formatStats(stats);
test('Format includes words', formatted.includes('words'));
test('Format includes headings', formatted.includes('heading'));

console.log('');

// Test 6: Apply All Transforms
console.log('Apply All Transforms');
console.log('-'.repeat(40));

const complexInput = `This is a long para-
graph that was bro-
ken incorrectly.

•
Standalone bullet item

Short
orphan`;

const transformed = applyAllTransforms(complexInput);

test('Transforms fix hyphenation', !transformed.includes('para-\ngraph'));
test('Transforms merge bullets', transformed.includes('- Standalone'));
test('Transforms defragment', !transformed.includes('Short\norphan') || transformed.includes('Short orphan'));

console.log('');

// Test 7: Edge Cases
console.log('Edge Cases');
console.log('-'.repeat(40));

// Empty input
const emptyResult = fixHyphenation('');
test('Handle empty input', emptyResult === '');

// No hyphenation needed
const noHyphenResult = fixHyphenation('Normal text without breaks');
test('Handle no hyphenation', noHyphenResult === 'Normal text without breaks');

// Short document (less than 3 pages)
const shortDoc: PageLines[] = [
  { pageNumber: 1, firstLines: ['Title'], lastLines: ['End'] },
  { pageNumber: 2, firstLines: ['Title'], lastLines: ['End'] },
];
const shortPatterns = detectHeaderFooterPatterns(shortDoc);
test('Skip short documents', shortPatterns.headers.length === 0 && shortPatterns.footers.length === 0);

// Stats on empty markdown
const emptyStats = calculateStats('', 0);
test('Handle empty markdown stats', emptyStats.wordCount === 0);

console.log('');
console.log('='.repeat(60));
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
