#!/usr/bin/env npx tsx
/**
 * Markdown Output Validator
 *
 * Validates the structure and quality of markdown output from PDF processing.
 * Can be used to verify output files after processing.
 *
 * Usage: npx tsx tests/validateOutput.ts <markdown-file>
 *        npx tsx tests/validateOutput.ts --dir tests/output
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

interface ValidationResult {
  file: string;
  passed: string[];
  failed: string[];
  warnings: string[];
  stats: {
    characters: number;
    words: number;
    lines: number;
    headings: number;
    tables: number;
    lists: number;
    mathBlocks: number;
  };
}

interface ValidationCheck {
  name: string;
  check: (content: string) => boolean;
  warning?: boolean;
}

const validationChecks: ValidationCheck[] = [
  // Basic structure
  {
    name: 'Non-empty content',
    check: (md) => md.trim().length > 0,
  },
  {
    name: 'No undefined values',
    check: (md) => !md.includes('undefined'),
  },
  {
    name: 'No [object Object]',
    check: (md) => !md.includes('[object Object]'),
  },
  {
    name: 'No excessive whitespace (>3 newlines)',
    check: (md) => !md.includes('\n\n\n\n'),
  },

  // Markdown validity
  {
    name: 'Balanced markdown emphasis',
    check: (md) => {
      const singleAsterisks = (md.match(/(?<!\*)\*(?!\*)/g) || []).length;
      const doubleAsterisks = (md.match(/\*\*/g) || []).length;
      return singleAsterisks % 2 === 0 && doubleAsterisks % 2 === 0;
    },
    warning: true,
  },
  {
    name: 'Balanced code blocks',
    check: (md) => {
      const codeBlocks = (md.match(/```/g) || []).length;
      return codeBlocks % 2 === 0;
    },
  },

  // Table validation
  {
    name: 'Tables have header separators',
    check: (md) => {
      const tableRows = md.match(/^\|.*\|$/gm) || [];
      if (tableRows.length < 2) return true; // No tables
      // Check that tables have separators after headers
      const separators = md.match(/^\|[\s\-:]+\|$/gm) || [];
      return separators.length > 0 || tableRows.length === 0;
    },
    warning: true,
  },

  // Math validation
  {
    name: 'Balanced math delimiters',
    check: (md) => {
      const singleDollar = (md.match(/(?<!\$)\$(?!\$)/g) || []).length;
      const doubleDollar = (md.match(/\$\$/g) || []).length;
      return singleDollar % 2 === 0 && doubleDollar % 2 === 0;
    },
    warning: true,
  },

  // Content quality
  {
    name: 'No binary garbage',
    check: (md) => {
      // Check for unusual character density
      const binaryChars = (md.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
      return binaryChars / md.length < 0.01;
    },
  },
  {
    name: 'Reasonable word density',
    check: (md) => {
      const words = md.match(/\b\w+\b/g) || [];
      const chars = md.replace(/\s/g, '').length;
      if (chars === 0) return true;
      const avgWordLength = chars / Math.max(words.length, 1);
      return avgWordLength >= 2 && avgWordLength <= 15;
    },
    warning: true,
  },
];

function validateMarkdown(content: string, filename: string): ValidationResult {
  const passed: string[] = [];
  const failed: string[] = [];
  const warnings: string[] = [];

  for (const check of validationChecks) {
    const result = check.check(content);
    if (result) {
      passed.push(check.name);
    } else if (check.warning) {
      warnings.push(check.name);
    } else {
      failed.push(check.name);
    }
  }

  // Calculate statistics
  const words = content.match(/\b\w+\b/g) || [];
  const lines = content.split('\n');
  const headings = content.match(/^#+\s+.+$/gm) || [];
  const tableRows = content.match(/^\|.*\|$/gm) || [];
  const listItems = content.match(/^[\s]*[-*+\d.]+\s+.+$/gm) || [];
  const mathBlocks = (content.match(/\$\$[\s\S]*?\$\$/g) || []).length +
                     (content.match(/(?<!\$)\$[^$\n]+\$(?!\$)/g) || []).length;

  // Estimate table count (groups of consecutive table rows)
  let tableCount = 0;
  let inTable = false;
  for (const line of lines) {
    if (/^\|.*\|$/.test(line.trim())) {
      if (!inTable) {
        tableCount++;
        inTable = true;
      }
    } else {
      inTable = false;
    }
  }

  return {
    file: filename,
    passed,
    failed,
    warnings,
    stats: {
      characters: content.length,
      words: words.length,
      lines: lines.length,
      headings: headings.length,
      tables: tableCount,
      lists: listItems.length,
      mathBlocks,
    },
  };
}

function printResult(result: ValidationResult): void {
  console.log(`\nFile: ${result.file}`);
  console.log('─'.repeat(50));

  console.log(`\nStatistics:`);
  console.log(`  Characters: ${result.stats.characters.toLocaleString()}`);
  console.log(`  Words: ${result.stats.words.toLocaleString()}`);
  console.log(`  Lines: ${result.stats.lines.toLocaleString()}`);
  console.log(`  Headings: ${result.stats.headings}`);
  console.log(`  Tables: ${result.stats.tables}`);
  console.log(`  List items: ${result.stats.lists}`);
  console.log(`  Math blocks: ${result.stats.mathBlocks}`);

  console.log(`\nValidation Results:`);

  for (const check of result.passed) {
    console.log(`  ✓ ${check}`);
  }

  for (const warning of result.warnings) {
    console.log(`  ⚠ ${warning} (warning)`);
  }

  for (const check of result.failed) {
    console.log(`  ✗ ${check}`);
  }

  const status = result.failed.length === 0 ? 'PASS' : 'FAIL';
  console.log(`\nStatus: ${status}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx tsx tests/validateOutput.ts <markdown-file>');
    console.log('       npx tsx tests/validateOutput.ts --dir <directory>');
    console.log('       npx tsx tests/validateOutput.ts --stdin');
    process.exit(1);
  }

  const results: ValidationResult[] = [];

  if (args[0] === '--dir') {
    const dir = args[1] || 'tests/output';
    if (!existsSync(dir)) {
      console.error(`Directory not found: ${dir}`);
      process.exit(1);
    }

    const files = readdirSync(dir)
      .filter(f => extname(f) === '.md')
      .map(f => join(dir, f));

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      results.push(validateMarkdown(content, basename(file)));
    }
  } else if (args[0] === '--stdin') {
    // Read from stdin
    let content = '';
    process.stdin.setEncoding('utf8');

    for await (const chunk of process.stdin) {
      content += chunk;
    }

    results.push(validateMarkdown(content, 'stdin'));
  } else {
    // Single file or multiple files
    for (const file of args) {
      if (!existsSync(file)) {
        console.error(`File not found: ${file}`);
        continue;
      }

      const stat = statSync(file);
      if (stat.isDirectory()) {
        const files = readdirSync(file)
          .filter(f => extname(f) === '.md')
          .map(f => join(file, f));

        for (const f of files) {
          const content = readFileSync(f, 'utf-8');
          results.push(validateMarkdown(content, basename(f)));
        }
      } else {
        const content = readFileSync(file, 'utf-8');
        results.push(validateMarkdown(content, basename(file)));
      }
    }
  }

  // Print results
  console.log('═'.repeat(60));
  console.log('MARKDOWN OUTPUT VALIDATION');
  console.log('═'.repeat(60));

  for (const result of results) {
    printResult(result);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const totalPassed = results.filter(r => r.failed.length === 0).length;
  const totalFailed = results.filter(r => r.failed.length > 0).length;

  console.log(`\nFiles validated: ${results.length}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(console.error);
