/**
 * run-all-tests.js
 * Master test runner for Merch-Aika automated test suites.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const testFiles = [
  'test-daily-invoice.js',
  'test-size-tags.js',
  'test-user-security.js'
];

// Optional server-dependent tests:
// test-stock-flow.js, test-security-fixes.js, test-order-export.js require a live local server on port 3000

async function runTest(file) {
  const filePath = path.join(__dirname, file);
  return new Promise((resolve) => {
    const start = Date.now();
    console.log(`\n========================================`);
    console.log(`▶ Running: ${file}`);
    console.log(`========================================`);

    const child = spawn(process.execPath, [filePath], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..')
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      if (code === 0) {
        console.log(`\n✅ ${file} PASSED (${duration}s)`);
        resolve({ file, passed: true, duration });
      } else {
        console.error(`\n❌ ${file} FAILED with code ${code} (${duration}s)`);
        resolve({ file, passed: false, duration });
      }
    });
  });
}

async function main() {
  console.log('🧪 Starting Merch-Aika Test Suite Runner...');
  const results = [];

  for (const file of testFiles) {
    const result = await runTest(file);
    results.push(result);
  }

  console.log('\n========================================');
  console.log('📊 TEST EXECUTION SUMMARY');
  console.log('========================================');

  let allPassed = true;
  results.forEach(r => {
    const icon = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${icon} - ${r.file} (${r.duration}s)`);
    if (!r.passed) allPassed = false;
  });

  console.log('========================================');
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('💥 SOME TESTS FAILED. Please review the output above.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
