#!/usr/bin/env npx tsx
/**
 * Test Runner
 *
 * Runs all unit tests for the PDF processing utilities.
 * Usage: npx tsx tests/runTests.ts
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TestResult {
  name: string;
  passed: boolean;
  output: string;
}

async function runTest(testFile: string): Promise<TestResult> {
  return new Promise((resolve) => {
    const testPath = join(__dirname, testFile);
    const child = spawn('npx', ['tsx', testPath], {
      cwd: join(__dirname, '..'),
      shell: true,
    });

    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      resolve({
        name: testFile,
        passed: code === 0,
        output,
      });
    });
  });
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           PDF2MKDWN TEST SUITE                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const testFiles = [
    'tableDetector.test.ts',
    'mathDetector.test.ts',
    'textTransforms.test.ts',
  ];

  const results: TestResult[] = [];

  for (const testFile of testFiles) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`Running: ${testFile}`);
    console.log('━'.repeat(60));

    const result = await runTest(testFile);
    results.push(result);
  }

  // Summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}: ${result.name}`);
  }

  console.log('');
  console.log(`Total: ${passedCount} passed, ${failedCount} failed`);
  console.log('');

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(console.error);
