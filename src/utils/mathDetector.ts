/**
 * Math Detection and LaTeX Conversion Module
 *
 * Detects mathematical expressions in text and converts Unicode
 * math symbols to LaTeX format for proper rendering.
 */

/**
 * Unicode to LaTeX mapping for Greek letters
 */
const GREEK_LETTERS: Record<string, string> = {
  // Lowercase
  '\u03B1': '\\alpha',
  '\u03B2': '\\beta',
  '\u03B3': '\\gamma',
  '\u03B4': '\\delta',
  '\u03B5': '\\epsilon',
  '\u03B6': '\\zeta',
  '\u03B7': '\\eta',
  '\u03B8': '\\theta',
  '\u03B9': '\\iota',
  '\u03BA': '\\kappa',
  '\u03BB': '\\lambda',
  '\u03BC': '\\mu',
  '\u03BD': '\\nu',
  '\u03BE': '\\xi',
  '\u03BF': 'o', // omicron
  '\u03C0': '\\pi',
  '\u03C1': '\\rho',
  '\u03C2': '\\varsigma',
  '\u03C3': '\\sigma',
  '\u03C4': '\\tau',
  '\u03C5': '\\upsilon',
  '\u03C6': '\\phi',
  '\u03C7': '\\chi',
  '\u03C8': '\\psi',
  '\u03C9': '\\omega',
  // Uppercase
  '\u0391': 'A', // Alpha
  '\u0392': 'B', // Beta
  '\u0393': '\\Gamma',
  '\u0394': '\\Delta',
  '\u0395': 'E', // Epsilon
  '\u0396': 'Z', // Zeta
  '\u0397': 'H', // Eta
  '\u0398': '\\Theta',
  '\u0399': 'I', // Iota
  '\u039A': 'K', // Kappa
  '\u039B': '\\Lambda',
  '\u039C': 'M', // Mu
  '\u039D': 'N', // Nu
  '\u039E': '\\Xi',
  '\u039F': 'O', // Omicron
  '\u03A0': '\\Pi',
  '\u03A1': 'P', // Rho
  '\u03A3': '\\Sigma',
  '\u03A4': 'T', // Tau
  '\u03A5': '\\Upsilon',
  '\u03A6': '\\Phi',
  '\u03A7': 'X', // Chi
  '\u03A8': '\\Psi',
  '\u03A9': '\\Omega',
  // Variants
  '\u03D1': '\\vartheta',
  '\u03D5': '\\varphi',
  '\u03D6': '\\varpi',
  '\u03F1': '\\varrho',
  '\u03F5': '\\varepsilon',
};

/**
 * Unicode to LaTeX mapping for superscripts
 */
const SUPERSCRIPTS: Record<string, string> = {
  '\u2070': '^0',
  '\u00B9': '^1',
  '\u00B2': '^2',
  '\u00B3': '^3',
  '\u2074': '^4',
  '\u2075': '^5',
  '\u2076': '^6',
  '\u2077': '^7',
  '\u2078': '^8',
  '\u2079': '^9',
  '\u207A': '^+',
  '\u207B': '^-',
  '\u207C': '^=',
  '\u207D': '^(',
  '\u207E': '^)',
  '\u207F': '^n',
  '\u2071': '^i',
};

/**
 * Unicode to LaTeX mapping for subscripts
 */
const SUBSCRIPTS: Record<string, string> = {
  '\u2080': '_0',
  '\u2081': '_1',
  '\u2082': '_2',
  '\u2083': '_3',
  '\u2084': '_4',
  '\u2085': '_5',
  '\u2086': '_6',
  '\u2087': '_7',
  '\u2088': '_8',
  '\u2089': '_9',
  '\u208A': '_+',
  '\u208B': '_-',
  '\u208C': '_=',
  '\u208D': '_(',
  '\u208E': '_)',
  '\u2090': '_a',
  '\u2091': '_e',
  '\u2092': '_o',
  '\u2093': '_x',
  '\u2095': '_h',
  '\u2096': '_k',
  '\u2097': '_l',
  '\u2098': '_m',
  '\u2099': '_n',
  '\u209A': '_p',
  '\u209B': '_s',
  '\u209C': '_t',
};

/**
 * Unicode to LaTeX mapping for mathematical operators and symbols
 */
const MATH_SYMBOLS: Record<string, string> = {
  // Comparison operators
  '\u2260': '\\neq',
  '\u2264': '\\leq',
  '\u2265': '\\geq',
  '\u226A': '\\ll',
  '\u226B': '\\gg',
  '\u2248': '\\approx',
  '\u2261': '\\equiv',
  '\u223C': '\\sim',
  '\u2245': '\\cong',
  '\u221D': '\\propto',

  // Arithmetic operators
  '\u00D7': '\\times',
  '\u00F7': '\\div',
  '\u00B1': '\\pm',
  '\u2213': '\\mp',
  '\u22C5': '\\cdot',
  '\u2217': '\\ast',
  '\u2218': '\\circ',

  // Set theory
  '\u2208': '\\in',
  '\u2209': '\\notin',
  '\u220B': '\\ni',
  '\u2282': '\\subset',
  '\u2283': '\\supset',
  '\u2286': '\\subseteq',
  '\u2287': '\\supseteq',
  '\u222A': '\\cup',
  '\u2229': '\\cap',
  '\u2205': '\\emptyset',

  // Logic
  '\u2227': '\\land',
  '\u2228': '\\lor',
  '\u00AC': '\\neg',
  '\u21D2': '\\Rightarrow',
  '\u21D0': '\\Leftarrow',
  '\u21D4': '\\Leftrightarrow',
  '\u2200': '\\forall',
  '\u2203': '\\exists',
  '\u2204': '\\nexists',

  // Calculus and analysis
  '\u2202': '\\partial',
  '\u221E': '\\infty',
  '\u2207': '\\nabla',
  '\u222B': '\\int',
  '\u222C': '\\iint',
  '\u222D': '\\iiint',
  '\u222E': '\\oint',
  '\u2211': '\\sum',
  '\u220F': '\\prod',
  '\u2210': '\\coprod',

  // Roots and fractions
  '\u221A': '\\sqrt',
  '\u221B': '\\sqrt[3]',
  '\u221C': '\\sqrt[4]',

  // Arrows
  '\u2192': '\\rightarrow',
  '\u2190': '\\leftarrow',
  '\u2194': '\\leftrightarrow',
  '\u2191': '\\uparrow',
  '\u2193': '\\downarrow',
  '\u21A6': '\\mapsto',

  // Miscellaneous
  '\u2032': "'", // prime
  '\u2033': "''", // double prime
  '\u2034': "'''", // triple prime
  '\u00B0': '^\\circ', // degree
  '\u2126': '\\Omega', // ohm
  '\u212B': '\\text{\\AA}', // angstrom
  '\u210F': '\\hbar', // h-bar
  '\u2113': '\\ell', // script l
  '\u211C': '\\Re', // real part
  '\u2111': '\\Im', // imaginary part
  '\u2135': '\\aleph', // aleph

  // Brackets
  '\u27E8': '\\langle',
  '\u27E9': '\\rangle',
  '\u2308': '\\lceil',
  '\u2309': '\\rceil',
  '\u230A': '\\lfloor',
  '\u230B': '\\rfloor',

  // Dots
  '\u22EF': '\\cdots',
  '\u22EE': '\\vdots',
  '\u22F1': '\\ddots',
  '\u2026': '\\ldots',
};

/**
 * Strong math indicators - characters that strongly suggest mathematical content
 * Does NOT include common punctuation like -, /, (), [] that appear in regular prose
 */
const STRONG_MATH_INDICATORS = new Set([
  ...Object.keys(GREEK_LETTERS),
  ...Object.keys(SUPERSCRIPTS),
  ...Object.keys(SUBSCRIPTS),
  ...Object.keys(MATH_SYMBOLS),
  '^', '_', // Only these special chars are strong indicators
]);

/**
 * Weak math indicators - common chars that may indicate math in context
 */
const WEAK_MATH_INDICATORS = new Set([
  '=', '+', '*',
]);

/**
 * Calculate the "math density" of a text segment
 * Returns a score from 0 to 1 indicating likelihood of mathematical content
 */
export function calculateMathDensity(text: string): number {
  if (!text || text.length === 0) return 0;

  let strongMathCharCount = 0;
  let weakMathCharCount = 0;
  const chars = [...text];

  for (const char of chars) {
    if (STRONG_MATH_INDICATORS.has(char)) {
      strongMathCharCount++;
    } else if (WEAK_MATH_INDICATORS.has(char)) {
      weakMathCharCount++;
    }
  }

  // Strong indicators are weighted more heavily
  // Weak indicators only count if there are also strong indicators present
  let mathCharCount = strongMathCharCount;
  if (strongMathCharCount > 0) {
    mathCharCount += weakMathCharCount * 0.3; // Weak indicators only count 30%
  }

  // Also check for patterns that indicate math
  let patternBonus = 0;

  // Only apply pattern bonuses if there are strong math indicators
  if (strongMathCharCount > 0) {
    // Fraction patterns: a/b (only if preceded by math context)
    if (/\d+\s*\/\s*\d+/.test(text)) patternBonus += 0.05;

    // Variable patterns with subscripts/superscripts
    if (/[a-zA-Z][\u2080-\u209C\u2070-\u207F]+/.test(text)) patternBonus += 0.15;

    // Equation patterns: x = something (only single letter variable)
    if (/^[a-zA-Z]\s*=\s*[^=]/.test(text) || /\s[a-zA-Z]\s*=\s*[^=]/.test(text)) patternBonus += 0.1;

    // Square root pattern
    if (/sqrt|\\sqrt|\u221A/.test(text)) patternBonus += 0.15;

    // Summation/integral patterns
    if (/sum|\\sum|\u2211|int|\\int|\u222B/.test(text)) patternBonus += 0.2;
  }

  const baseDensity = mathCharCount / chars.length;
  return Math.min(1, baseDensity + patternBonus);
}

/**
 * Check if a text segment should be treated as inline math
 * Uses pdfmd's lower threshold of 0.25 for inline detection
 */
export function isInlineMath(text: string): boolean {
  const density = calculateMathDensity(text);

  // Lower threshold (0.25 per pdfmd) for inline math in short text
  if (density > 0.25 && text.length < 100) return true;

  // Short expressions with clear math indicators
  if (text.length < 50) {
    // Has Greek letters
    if (Object.keys(GREEK_LETTERS).some(g => text.includes(g))) return true;

    // Has superscripts/subscripts
    if (Object.keys(SUPERSCRIPTS).some(s => text.includes(s))) return true;
    if (Object.keys(SUBSCRIPTS).some(s => text.includes(s))) return true;

    // Has math operators
    if (Object.keys(MATH_SYMBOLS).some(m => text.includes(m))) return true;
  }

  return false;
}

/**
 * Equation operators that indicate display math (from pdfmd)
 * If a math block has one of these, it's more likely to be a full equation
 */
const EQUATION_OPERATORS = /[=≤≥≠≈≃⇒→⇔↦∝]/;

/**
 * LaTeX environment patterns that indicate display math
 */
const LATEX_ENVIRONMENT_PATTERN = /\\begin\{(equation|align|gather|multline|eqnarray|displaymath)\*?\}/;

/**
 * Check if a text block should be treated as display (block) math
 */
export function isDisplayMath(text: string): boolean {
  // Check for display math indicators
  const trimmed = text.trim();

  // Already wrapped in display delimiters
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) return true;
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) return true;

  // LaTeX environment detection (from pdfmd)
  if (LATEX_ENVIRONMENT_PATTERN.test(trimmed)) return true;

  // Multi-line equations with decent density
  if (trimmed.includes('\n') && calculateMathDensity(trimmed) > 0.35) return true;

  // For standalone lines, require BOTH:
  // 1. Decent math density (lowered from 0.5 to 0.4 per pdfmd)
  // 2. An equation operator (=, ≤, etc.) OR special math constructs
  const density = calculateMathDensity(trimmed);
  if (trimmed.length < 200 && density > 0.4) {
    const hasEquationOperator = EQUATION_OPERATORS.test(trimmed);
    const hasIntegral = /\u222B|\\int|integral/i.test(trimmed);
    const hasSummation = /\u2211|\\sum|summation/i.test(trimmed);
    const hasMatrix = /matrix|\\begin\{/i.test(trimmed);
    const hasFraction = /\\frac|\\dfrac|\\tfrac/.test(trimmed);

    // Must have equation operator or special construct to be display math
    if (hasEquationOperator || hasIntegral || hasSummation || hasMatrix || hasFraction) {
      return true;
    }
  }

  return false;
}

/**
 * Convert Unicode math characters to LaTeX
 */
export function unicodeToLatex(text: string): string {
  let result = text;

  // Replace Greek letters
  for (const [unicode, latex] of Object.entries(GREEK_LETTERS)) {
    result = result.replaceAll(unicode, latex + ' ');
  }

  // Replace superscripts - group consecutive ones
  result = result.replace(/[\u2070\u00B9\u00B2\u00B3\u2074-\u207F\u2071]+/g, (match) => {
    let latex = '^{';
    for (const char of match) {
      const mapped = SUPERSCRIPTS[char];
      if (mapped) {
        latex += mapped.slice(1); // Remove the ^ prefix
      }
    }
    return latex + '}';
  });

  // Replace subscripts - group consecutive ones
  result = result.replace(/[\u2080-\u209C]+/g, (match) => {
    let latex = '_{';
    for (const char of match) {
      const mapped = SUBSCRIPTS[char];
      if (mapped) {
        latex += mapped.slice(1); // Remove the _ prefix
      }
    }
    return latex + '}';
  });

  // Replace math symbols
  for (const [unicode, latex] of Object.entries(MATH_SYMBOLS)) {
    result = result.replaceAll(unicode, latex + ' ');
  }

  // Clean up extra spaces
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Normalize LaTeX that may already exist in text
 * Fixes common formatting issues
 */
export function normalizeLatex(text: string): string {
  let result = text;

  // Fix spacing around operators
  result = result.replace(/\s*=\s*/g, ' = ');
  result = result.replace(/\s*\+\s*/g, ' + ');
  result = result.replace(/\s*-\s*/g, ' - ');

  // Fix fraction notation
  result = result.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');

  // Clean up multiple spaces
  result = result.replace(/\s+/g, ' ');

  return result.trim();
}

/**
 * Wrap text in appropriate math delimiters
 */
export function wrapMathDelimiters(text: string, isDisplay: boolean): string {
  const trimmed = text.trim();

  // Already has delimiters
  if (trimmed.startsWith('$') || trimmed.startsWith('\\(') || trimmed.startsWith('\\[')) {
    return trimmed;
  }

  if (isDisplay) {
    return `$$\n${trimmed}\n$$`;
  } else {
    return `$${trimmed}$`;
  }
}

export interface MathSegment {
  text: string;
  isMath: boolean;
  isDisplay: boolean;
  startIndex: number;
  endIndex: number;
}

/**
 * Detect and segment mathematical content within text
 */
export function detectMathSegments(text: string): MathSegment[] {
  const segments: MathSegment[] = [];

  // Check for existing LaTeX delimiters first
  const delimiterPattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([^)]+\\\))/g;
  let lastIndex = 0;
  let match;

  while ((match = delimiterPattern.exec(text)) !== null) {
    // Add non-math text before this match
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      segments.push(...detectMathInPlainText(beforeText, lastIndex));
    }

    // Add the math segment
    const mathText = match[0];
    const isDisplay = mathText.startsWith('$$') || mathText.startsWith('\\[');
    segments.push({
      text: mathText,
      isMath: true,
      isDisplay,
      startIndex: match.index,
      endIndex: match.index + mathText.length,
    });

    lastIndex = match.index + mathText.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    segments.push(...detectMathInPlainText(remainingText, lastIndex));
  }

  return segments;
}

/**
 * Check if text looks like prose (sentences, paragraphs) vs math
 */
function looksLikeProse(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return false;

  const words = trimmed.split(/\s+/);
  if (words.length < 5) return false;

  // Check for prose indicators
  const endsWithPunctuation = /[.!?]$/.test(trimmed);
  const hasProseWords = /\b(the|a|an|is|are|was|were|has|have|had|to|of|in|for|on|with|at|by|from|that|this|and|or|but)\b/i.test(trimmed);
  const avgWordLength = trimmed.replace(/\s/g, '').length / words.length;
  const hasLongWords = avgWordLength > 4;

  let proseScore = 0;
  if (endsWithPunctuation) proseScore++;
  if (hasProseWords) proseScore++;
  if (hasLongWords) proseScore++;
  if (words.length > 10) proseScore++;

  return proseScore >= 2;
}

/**
 * Count strong math indicators in text
 */
function countStrongMathIndicators(text: string): number {
  let count = 0;
  for (const char of text) {
    if (STRONG_MATH_INDICATORS.has(char)) {
      count++;
    }
  }
  return count;
}

/**
 * Find inline math segments within a text string.
 * This is the key technique from pdfmd - finding math spans within prose lines.
 *
 * Returns array of [start, end, mathText] for each detected inline math segment.
 */
function findInlineMathSpans(text: string): Array<[number, number, string]> {
  const spans: Array<[number, number, string]> = [];

  // Pattern to find potential inline math: sequences containing strong math indicators
  // surrounded by word boundaries or whitespace
  const mathChars = [
    ...Object.keys(GREEK_LETTERS),
    ...Object.keys(SUPERSCRIPTS),
    ...Object.keys(SUBSCRIPTS),
    ...Object.keys(MATH_SYMBOLS),
  ].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  if (!mathChars) return spans;

  // Match sequences that include math characters and surrounding context
  // This captures things like "x²", "α + β", "E = mc²", etc.
  const mathSequencePattern = new RegExp(
    `[\\w]*(${mathChars})[\\w\\s+\\-=<>\\^_{}()]*(?:${mathChars})?[\\w]*`,
    'g'
  );

  let match;
  while ((match = mathSequencePattern.exec(text)) !== null) {
    const matchText = match[0].trim();

    // Skip if too long (probably a sentence, not inline math)
    if (matchText.length > 80) continue;

    // Skip if it looks like prose (many words, ends with period)
    const words = matchText.split(/\s+/);
    if (words.length > 6) continue;
    if (matchText.endsWith('.') && words.length > 2) continue;

    // Verify it has sufficient math density
    const density = calculateMathDensity(matchText);
    if (density >= 0.2) {  // Lower threshold for spans (0.2 per pdfmd)
      spans.push([match.index, match.index + match[0].length, matchText]);
    }
  }

  // Merge overlapping spans
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number, string]> = [];
  for (const span of spans) {
    if (merged.length === 0 || span[0] > merged[merged.length - 1][1]) {
      merged.push(span);
    } else {
      // Overlapping - extend the previous span
      const prev = merged[merged.length - 1];
      prev[1] = Math.max(prev[1], span[1]);
      prev[2] = text.slice(prev[0], prev[1]);
    }
  }

  return merged;
}

/**
 * Detect potential math in plain text (without delimiters)
 * Now includes inline math segment splitting from pdfmd
 */
function detectMathInPlainText(text: string, baseIndex: number): MathSegment[] {
  const segments: MathSegment[] = [];

  if (!text.trim()) {
    return [{
      text,
      isMath: false,
      isDisplay: false,
      startIndex: baseIndex,
      endIndex: baseIndex + text.length,
    }];
  }

  // Count actual strong math indicators
  const strongIndicatorCount = countStrongMathIndicators(text);

  // If no strong math indicators, it's definitely not math
  if (strongIndicatorCount === 0) {
    return [{
      text,
      isMath: false,
      isDisplay: false,
      startIndex: baseIndex,
      endIndex: baseIndex + text.length,
    }];
  }

  // Check overall math density
  const density = calculateMathDensity(text);

  // Check if this looks like prose
  if (looksLikeProse(text)) {
    // For prose with math, try to find inline math segments (from pdfmd)
    // This allows "Let α be a constant where x² > 0" to have α and x² detected
    const inlineSpans = findInlineMathSpans(text);

    if (inlineSpans.length > 0 && density < 0.4) {
      // Split text into segments based on inline math spans
      let lastEnd = 0;
      for (const [start, end, _mathText] of inlineSpans) {
        // Add non-math segment before this math span
        if (start > lastEnd) {
          segments.push({
            text: text.slice(lastEnd, start),
            isMath: false,
            isDisplay: false,
            startIndex: baseIndex + lastEnd,
            endIndex: baseIndex + start,
          });
        }
        // Add the math span
        segments.push({
          text: text.slice(start, end),
          isMath: true,
          isDisplay: false, // Inline segments are never display
          startIndex: baseIndex + start,
          endIndex: baseIndex + end,
        });
        lastEnd = end;
      }
      // Add remaining non-math text
      if (lastEnd < text.length) {
        segments.push({
          text: text.slice(lastEnd),
          isMath: false,
          isDisplay: false,
          startIndex: baseIndex + lastEnd,
          endIndex: baseIndex + text.length,
        });
      }
      return segments;
    }

    // If no inline spans found or density is high enough, use original behavior
    if (density < 0.4) {
      return [{
        text,
        isMath: false,
        isDisplay: false,
        startIndex: baseIndex,
        endIndex: baseIndex + text.length,
      }];
    }
  }

  // Require higher threshold for longer text
  const lengthFactor = Math.min(1, text.length / 50);
  const requiredDensity = 0.12 + (lengthFactor * 0.13); // Lowered from 0.15/0.30 per pdfmd

  if (density < requiredDensity) {
    return [{
      text,
      isMath: false,
      isDisplay: false,
      startIndex: baseIndex,
      endIndex: baseIndex + text.length,
    }];
  }

  // Additional check: require multiple strong indicators for longer text
  if (text.length > 100 && strongIndicatorCount < 3) {
    return [{
      text,
      isMath: false,
      isDisplay: false,
      startIndex: baseIndex,
      endIndex: baseIndex + text.length,
    }];
  }

  // If density is high enough and passes all checks, treat as math
  const isDisplay = isDisplayMath(text);
  segments.push({
    text,
    isMath: true,
    isDisplay,
    startIndex: baseIndex,
    endIndex: baseIndex + text.length,
  });

  return segments;
}

/**
 * Process text to convert detected math to LaTeX format
 *
 * This function:
 * 1. Finds math expressions in the text
 * 2. Converts Unicode math chars to LaTeX
 * 3. Wraps actual math expressions in delimiters
 */
export function processMathInText(text: string): string {
  const segments = detectMathSegments(text);
  let result = '';

  for (const segment of segments) {
    if (segment.isMath) {
      // Check if already has delimiters
      const trimmed = segment.text.trim();
      if (trimmed.startsWith('$') || trimmed.startsWith('\\(') || trimmed.startsWith('\\[')) {
        result += segment.text;
      } else {
        // Convert Unicode to LaTeX and wrap
        const latex = unicodeToLatex(segment.text);
        const normalized = normalizeLatex(latex);
        result += wrapMathDelimiters(normalized, segment.isDisplay);
      }
    } else {
      // Even for non-math segments, convert any unicode math chars
      // This ensures isolated symbols get converted even in prose
      const hasUnicodeMath = countStrongMathIndicators(segment.text) > 0;
      if (hasUnicodeMath) {
        result += unicodeToLatex(segment.text);
      } else {
        result += segment.text;
      }
    }
  }

  return result;
}

/**
 * Check if a text block contains significant mathematical content
 * Returns true only if the text has clear math content that should be processed
 */
export function containsMath(text: string): boolean {
  // Count strong math indicators
  const strongCount = countStrongMathIndicators(text);
  if (strongCount === 0) return false;

  // For short text (< 50 chars), a single strong indicator is enough
  if (text.length < 50 && strongCount >= 1) return true;

  // For longer text, require higher density or multiple indicators
  const density = calculateMathDensity(text);

  // Reject if it looks like prose with minimal math
  if (looksLikeProse(text) && density < 0.3) return false;

  // Require reasonable density for longer text
  return density > 0.15 || strongCount >= 3;
}

/**
 * Detect if text contains garbled/corrupted characters from embedded math fonts.
 * This happens when PDFs use fonts like Computer Modern with custom encodings
 * that MuPDF cannot properly map to Unicode.
 *
 * Returns true if the text likely contains corrupted math that needs Vision AI.
 */
export function hasGarbledMathFont(text: string): boolean {
  // Count replacement characters (U+FFFD) - sign of encoding failure
  const replacementChars = (text.match(/\uFFFD/g) || []).length;
  if (replacementChars >= 3) return true;

  // Count Private Use Area characters (U+E000 to U+F8FF) - used by math fonts
  const puaChars = (text.match(/[\uE000-\uF8FF]/g) || []).length;
  if (puaChars >= 2) return true;

  // Check for unusual character sequences that suggest math font corruption
  // These patterns are common when math fonts are incorrectly decoded:
  // - Sequences of special chars mixed with normal text
  // - Unusual combining characters
  // - Characters from mathematical operator blocks appearing randomly
  const suspiciousPatterns = [
    /[a-zA-Z]\uFFFD[a-zA-Z]/g,           // Letter-garbled-letter
    /\uFFFD{2,}/g,                        // Multiple replacement chars
    /[\u2200-\u22FF]{3,}/g,              // Too many math operators in sequence
    /[><=]\s*[A-Za-z]\s*[><=]/g,         // Likely garbled subscripts like "ℎ>@�"
    /[A-Za-z][>@]\s*[A-Za-z]/g,          // Pattern like "J>" or "ℎ>@"
    /\([^\)]{0,3}\uFFFD/g,               // Garbled in parentheses
  ];

  let suspiciousCount = 0;
  for (const pattern of suspiciousPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      suspiciousCount += matches.length;
    }
  }

  // If we find multiple suspicious patterns, likely garbled math
  if (suspiciousCount >= 3) return true;

  // Check for math-like structure with mostly unrenderable chars
  // e.g., "K(��LC>@�+ ��Mℎ>@�)" - has parentheses, plus, but garbled content
  if (/[()=+\-*/∑∫]\s*[\uFFFD\uE000-\uF8FF]/.test(text)) {
    return true;
  }

  return false;
}

/**
 * Analyze a page's text to determine if Vision AI should be recommended
 * for better math extraction.
 */
export function shouldRecommendVisionAI(pageText: string): {
  recommend: boolean;
  reason?: string;
  garbledPercentage?: number;
} {
  if (!pageText || pageText.length < 50) {
    return { recommend: false };
  }

  // Check for garbled math fonts
  if (hasGarbledMathFont(pageText)) {
    // Estimate how much is garbled
    const totalChars = pageText.length;
    const garbledChars = (pageText.match(/[\uFFFD\uE000-\uF8FF]/g) || []).length;
    const suspiciousPatterns = (pageText.match(/[>@]\s*[A-Za-z]|[A-Za-z]\s*[>@]/g) || []).length;

    const garbledPercentage = ((garbledChars + suspiciousPatterns * 2) / totalChars) * 100;

    if (garbledPercentage > 1 || garbledChars > 5) {
      return {
        recommend: true,
        reason: 'Detected embedded math fonts that cannot be properly extracted. Vision AI can read equations visually.',
        garbledPercentage: Math.round(garbledPercentage * 10) / 10,
      };
    }
  }

  // Check for patterns suggesting LaTeX/math document
  const mathPatterns = [
    /\\(alpha|beta|gamma|theta|sum|int|frac|sqrt)/i,  // LaTeX commands
    /\$[^$]+\$/,                                        // Already has $ delimiters
    /\\begin\{(equation|align)/i,                       // LaTeX environments
  ];

  for (const pattern of mathPatterns) {
    if (pattern.test(pageText)) {
      return {
        recommend: false,  // Already has proper LaTeX, no need for Vision
      };
    }
  }

  return { recommend: false };
}

/**
 * Extract all mathematical expressions from text
 */
export function extractMathExpressions(text: string): string[] {
  const segments = detectMathSegments(text);
  return segments
    .filter(s => s.isMath)
    .map(s => s.text);
}
