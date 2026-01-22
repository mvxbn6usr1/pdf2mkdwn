/**
 * Math Detector Unit Tests
 *
 * Tests math detection and Unicode-to-LaTeX conversion.
 */

import {
  calculateMathDensity,
  isInlineMath,
  isDisplayMath,
  unicodeToLatex,
  processMathInText,
  containsMath,
  detectMathSegments,
} from '../src/utils/mathDetector';

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
console.log('MATH DETECTOR TESTS');
console.log('='.repeat(60));
console.log('');

// Test 1: Unicode to LaTeX conversion
console.log('Unicode to LaTeX Conversion');
console.log('-'.repeat(40));

const unicodeTests = [
  { input: '\u03B1', expected: '\\alpha', name: 'Greek alpha' },
  { input: '\u03B2', expected: '\\beta', name: 'Greek beta' },
  { input: '\u03C0', expected: '\\pi', name: 'Greek pi' },
  { input: '\u00B2', expected: '^{2}', name: 'Superscript 2' },
  { input: '\u2082', expected: '_{2}', name: 'Subscript 2' },
  { input: '\u2264', expected: '\\leq', name: 'Less than or equal' },
  { input: '\u2265', expected: '\\geq', name: 'Greater than or equal' },
  { input: '\u221E', expected: '\\infty', name: 'Infinity' },
  { input: '\u222B', expected: '\\int', name: 'Integral' },
  { input: '\u2211', expected: '\\sum', name: 'Summation' },
  { input: '\u221A', expected: '\\sqrt', name: 'Square root' },
  { input: '\u00D7', expected: '\\times', name: 'Times' },
  { input: '\u2208', expected: '\\in', name: 'Element of' },
  { input: '\u2200', expected: '\\forall', name: 'For all' },
  { input: '\u2203', expected: '\\exists', name: 'Exists' },
];

for (const { input, expected, name } of unicodeTests) {
  const result = unicodeToLatex(input);
  const contains = result.includes(expected.replace(/\s+$/, ''));
  test(name, contains, `got "${result}", expected to contain "${expected}"`);
}

console.log('');

// Test 2: Math density calculation
console.log('Math Density Calculation');
console.log('-'.repeat(40));

const densityTests = [
  { input: 'Hello world', minDensity: 0, maxDensity: 0.1, name: 'Plain text' },
  // ASCII 'x = 2 + 3' has no strong math indicators (no unicode symbols)
  // so density should be low - this prevents false positives on normal text
  { input: 'x = 2 + 3', minDensity: 0, maxDensity: 0.1, name: 'Simple ASCII equation (no unicode)' },
  { input: '\u03B1 + \u03B2 = \u03B3', minDensity: 0.3, maxDensity: 1, name: 'Greek letter equation' },
  { input: 'E = mc\u00B2', minDensity: 0.1, maxDensity: 0.5, name: 'E=mc² formula' },
  { input: '\u222Bf(x)dx', minDensity: 0.3, maxDensity: 1, name: 'Integral notation' },
  { input: '\u2211\u1D62\u208C\u2080\u207F x\u1D62', minDensity: 0.3, maxDensity: 1, name: 'Summation notation' },
];

for (const { input, minDensity, maxDensity, name } of densityTests) {
  const density = calculateMathDensity(input);
  const inRange = density >= minDensity && density <= maxDensity;
  test(name, inRange, `density=${density.toFixed(3)}, expected [${minDensity}, ${maxDensity}]`);
}

console.log('');

// Test 3: Inline vs Display math detection
console.log('Inline/Display Math Detection');
console.log('-'.repeat(40));

const inlineTests = [
  { input: 'x\u00B2', expectInline: true, name: 'x² as inline' },
  { input: '\u03B1 + \u03B2', expectInline: true, name: 'α + β as inline' },
  { input: 'Hello world', expectInline: false, name: 'Plain text not inline' },
];

for (const { input, expectInline, name } of inlineTests) {
  const result = isInlineMath(input);
  test(name, result === expectInline, `got ${result}, expected ${expectInline}`);
}

const displayTests = [
  { input: '$$x = 2$$', expectDisplay: true, name: 'Already delimited display math' },
  { input: '\\[x = 2\\]', expectDisplay: true, name: 'LaTeX display brackets' },
  { input: 'Short text', expectDisplay: false, name: 'Short plain text not display' },
];

for (const { input, expectDisplay, name } of displayTests) {
  const result = isDisplayMath(input);
  test(name, result === expectDisplay, `got ${result}, expected ${expectDisplay}`);
}

console.log('');

// Test 4: Contains math function
console.log('Contains Math Detection');
console.log('-'.repeat(40));

const containsTests = [
  { input: 'Regular paragraph without math.', expectMath: false, name: 'Plain paragraph' },
  { input: 'The formula is E = mc\u00B2.', expectMath: true, name: 'Text with superscript' },
  { input: 'Let \u03B1 be a constant.', expectMath: true, name: 'Text with Greek letter' },
  { input: 'If x \u2264 5 then...', expectMath: true, name: 'Text with comparison operator' },
  { input: 'The weather is sunny today.', expectMath: false, name: 'Plain English sentence' },
];

for (const { input, expectMath, name } of containsTests) {
  const result = containsMath(input);
  test(name, result === expectMath, `got ${result}, expected ${expectMath}`);
}

console.log('');

// Test 5: Full processing with detectMathSegments
console.log('Math Segment Detection');
console.log('-'.repeat(40));

const segmentTests = [
  {
    input: 'Text $x=2$ more text',
    expectSegments: 3,
    name: 'Text with inline math',
  },
  {
    input: 'Before $$y = mx + b$$ after',
    expectSegments: 3,
    name: 'Text with display math',
  },
  {
    input: 'Plain text only',
    expectSegments: 1,
    name: 'Plain text single segment',
  },
];

for (const { input, expectSegments, name } of segmentTests) {
  const segments = detectMathSegments(input);
  test(name, segments.length === expectSegments, `got ${segments.length} segments, expected ${expectSegments}`);
}

console.log('');

// Test 6: Process math in text (end-to-end)
console.log('End-to-End Math Processing');
console.log('-'.repeat(40));

const processingTests = [
  {
    input: 'The area is A = \u03C0r\u00B2',
    expectContains: '\\pi',
    name: 'Process π in equation',
  },
  {
    input: 'E = mc\u00B2 is famous',
    expectContains: '^{2}',
    name: 'Process superscript in equation',
  },
  {
    input: 'If \u03B1 \u2264 \u03B2 then...',
    expectContains: '\\leq',
    name: 'Process comparison with Greek',
  },
];

for (const { input, expectContains, name } of processingTests) {
  const result = processMathInText(input);
  const contains = result.includes(expectContains);
  test(name, contains, `output doesn't contain "${expectContains}": ${result}`);
}

console.log('');

// Test 7: Complex expressions
console.log('Complex Expression Handling');
console.log('-'.repeat(40));

const complexTests = [
  {
    input: 'The integral \u222B\u2080\u00B9 f(x) dx = F(1) - F(0)',
    name: 'Definite integral notation',
  },
  {
    input: 'Sum \u2211\u1D62\u208C\u2081\u207F x\u1D62 = total',
    name: 'Summation with subscripts/superscripts',
  },
  {
    input: 'Matrix: A\u00B9\u00B2\u00B3 = A\u2076',
    name: 'Matrix power notation',
  },
];

for (const { input, name } of complexTests) {
  const result = processMathInText(input);
  const hasLatex = result.includes('\\') || result.includes('^') || result.includes('_');
  test(name, hasLatex, `no LaTeX conversion detected in: ${result}`);
}

console.log('');
console.log('='.repeat(60));
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
