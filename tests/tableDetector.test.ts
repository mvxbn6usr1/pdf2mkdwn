/**
 * Table Detector Unit Tests
 *
 * Tests the table detection functionality with various input formats.
 */

import {
  detectTables,
  tableToMarkdown,
  scoreTableLikelihood,
  type DetectedTable,
} from '../src/utils/tableDetector';

// Test data types
interface TextLine {
  text: string;
  y: number;
  x: number;
  width: number;
  fontSize: number;
}

// Helper to create text lines
function createTextLines(texts: string[], startY: number = 0, lineHeight: number = 12): TextLine[] {
  return texts.map((text, idx) => ({
    text,
    y: startY + idx * lineHeight,
    x: 0,
    width: text.length * 6,
    fontSize: 12,
  }));
}

// Test cases
const testCases = {
  // Test case 1: Simple bordered table
  borderedTable: {
    name: 'Bordered table with pipes',
    input: [
      '| Name | Age | City |',
      '|------|-----|------|',
      '| John | 30 | NYC |',
      '| Jane | 25 | LA |',
    ],
    expectedRows: 3, // header + 2 data rows
    expectedCols: 3,
    expectTable: true,
  },

  // Test case 2: ASCII whitespace-aligned table
  asciiTable: {
    name: 'ASCII whitespace-aligned table',
    input: [
      'Name        Age    City',
      'John        30     New York',
      'Jane        25     Los Angeles',
      'Bob         35     Chicago',
    ],
    expectedRows: 4,
    expectedCols: 3,
    expectTable: true,
  },

  // Test case 3: Regular paragraph (should not detect as table)
  regularParagraph: {
    name: 'Regular paragraph text',
    input: [
      'This is a normal paragraph of text.',
      'It should not be detected as a table.',
      'Even though it has multiple lines.',
    ],
    expectedRows: 0,
    expectedCols: 0,
    expectTable: false,
  },

  // Test case 4: Numeric data table
  numericTable: {
    name: 'Numeric data table',
    input: [
      '| Year | Revenue | Profit |',
      '|------|---------|--------|',
      '| 2020 | $1.2M | $200K |',
      '| 2021 | $1.5M | $350K |',
      '| 2022 | $2.0M | $500K |',
    ],
    expectedRows: 4,
    expectedCols: 3,
    expectTable: true,
  },

  // Test case 5: Mixed content with table
  mixedContent: {
    name: 'Mixed content with embedded table',
    input: [
      'Introduction paragraph.',
      '',
      '| Item | Quantity |',
      '|------|----------|',
      '| A | 10 |',
      '| B | 20 |',
      '',
      'Conclusion paragraph.',
    ],
    expectedRows: 3,
    expectedCols: 2,
    expectTable: true,
  },

  // FALSE POSITIVE TEST CASES - these should NOT be detected as tables

  // Test case 6: Magazine two-column layout (prose, not table)
  magazineColumns: {
    name: 'Magazine two-column layout (should NOT be table)',
    input: [
      'Venice, Italy: Over 1,500 signatories urged the    Gaza/Israel: The IDF',
      'festival to drop Gal Gadot.                        recovered and identified the',
      'Sanaa, Yemen: An Israeli strike killed Houthi PM   bodies of hostages Ilan Weiss',
      'Ahmed al-Rahawi and several ministers; the         z"l and Idan Shtivi z"l.',
      'group vowed retaliation.                           Frankfurt am Main, Germany:',
    ],
    expectedRows: 0,
    expectedCols: 0,
    expectTable: false,
  },

  // Test case 7: News headlines (prose sentences, not data)
  newsHeadlines: {
    name: 'News headlines (should NOT be table)',
    input: [
      'Minneapolis, USA: Videos tied to the school-church shooting suspect showed rifles.',
      'New York City, USA: Vandals daubed graffiti on the building in Greenwich Village.',
      'Lyon, France: A newly unveiled Holocaust memorial was scratched with graffiti.',
    ],
    expectedRows: 0,
    expectedCols: 0,
    expectTable: false,
  },

  // Test case 8: Paragraph text that happens to have consistent spacing
  alignedParagraph: {
    name: 'Paragraph text with spacing (should NOT be table)',
    input: [
      'The quick brown fox jumps over the lazy dog.',
      'A wonderful serenity has taken possession of my entire soul.',
      'I am alone, and feel the charm of existence in this spot.',
    ],
    expectedRows: 0,
    expectedCols: 0,
    expectTable: false,
  },
};

// Run tests
console.log('='.repeat(60));
console.log('TABLE DETECTOR TESTS');
console.log('='.repeat(60));
console.log('');

let passed = 0;
let failed = 0;

for (const [key, testCase] of Object.entries(testCases)) {
  console.log(`Test: ${testCase.name}`);
  console.log('-'.repeat(40));

  const lines = createTextLines(testCase.input);
  const tables = detectTables(lines, 612); // Standard page width

  const foundTable = tables.length > 0;
  const tableMatches = foundTable === testCase.expectTable;

  if (tableMatches) {
    if (foundTable) {
      const table = tables[0];
      console.log(`  Found table with ${table.rows.length} rows, confidence: ${table.confidence.toFixed(2)}`);

      // Verify row count
      if (table.rows.length === testCase.expectedRows) {
        console.log(`  Row count: PASS (${table.rows.length})`);
        passed++;
      } else {
        console.log(`  Row count: FAIL (expected ${testCase.expectedRows}, got ${table.rows.length})`);
        failed++;
      }

      // Verify column count
      const colCount = table.columnAlignments.length;
      if (colCount === testCase.expectedCols) {
        console.log(`  Column count: PASS (${colCount})`);
        passed++;
      } else {
        console.log(`  Column count: FAIL (expected ${testCase.expectedCols}, got ${colCount})`);
        failed++;
      }

      // Test markdown output
      const markdown = tableToMarkdown(table);
      const hasMarkdownTable = markdown.includes('|');
      console.log(`  Markdown output: ${hasMarkdownTable ? 'PASS' : 'FAIL'}`);
      if (hasMarkdownTable) passed++;
      else failed++;

      console.log('  Generated markdown:');
      console.log(markdown.split('\n').map(l => '    ' + l).join('\n'));
    } else {
      console.log(`  Correctly detected as non-table: PASS`);
      passed++;
    }
  } else {
    console.log(`  Table detection: FAIL (expected ${testCase.expectTable ? 'table' : 'no table'}, got ${foundTable ? 'table' : 'no table'})`);
    failed++;
  }

  console.log('');
}

// Test scoreTableLikelihood function
console.log('Table Likelihood Scoring Tests');
console.log('-'.repeat(40));

const scoringTests = [
  { text: '| A | B | C |', minScore: 0.3, description: 'Pipe-delimited text' },
  { text: '$100.00    $200.00    $300.00', minScore: 0.3, description: 'Currency values with spacing' },
  { text: 'This is normal text.', minScore: 0, maxScore: 0.2, description: 'Normal text' },
  { text: '10\t20\t30\t40', minScore: 0.2, description: 'Tab-separated numbers' },
];

for (const test of scoringTests) {
  const score = scoreTableLikelihood(test.text);
  const passMin = test.minScore === undefined || score >= test.minScore;
  const passMax = test.maxScore === undefined || score <= test.maxScore;
  const pass = passMin && passMax;

  console.log(`  ${test.description}: ${score.toFixed(2)} - ${pass ? 'PASS' : 'FAIL'}`);
  if (pass) passed++;
  else failed++;
}

console.log('');
console.log('='.repeat(60));
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
