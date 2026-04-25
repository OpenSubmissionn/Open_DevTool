import * as fs from 'fs';
import * as path from 'path';

// Define the expected schema for a benchmark entry
interface Benchmark {
  operation: string;
  framework: string;
  estimatedCU: number;
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

const BENCHMARK_SCHEMA = {
  operation: 'string',
  framework: 'string',
  estimatedCU: 'number',
  confidence: 'string',
  source: 'string',
};

const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];

/**
 * Validates the structure and data types of a single benchmark object.
 * @param entry - The benchmark entry to validate.
 * @param index - The index of the entry in the array for logging.
 * @returns True if the entry is valid, false otherwise.
 */
function validateEntry(entry: any, index: number): entry is Benchmark {
  const errors: string[] = [];

  for (const key in BENCHMARK_SCHEMA) {
    if (!(key in entry)) {
      errors.push(`Missing required key: "${key}"`);
      continue;
    }

    const expectedType = BENCHMARK_SCHEMA[key as keyof typeof BENCHMARK_SCHEMA];
    const actualType = typeof entry[key];

    if (actualType !== expectedType) {
      errors.push(
        `Invalid type for key "${key}". Expected ${expectedType}, but got ${actualType}.`
      );
    }
  }

  if (entry.confidence && !CONFIDENCE_LEVELS.includes(entry.confidence)) {
    errors.push(`Invalid value for "confidence". Must be one of: ${CONFIDENCE_LEVELS.join(', ')}.`);
  }

  if (errors.length > 0) {
    console.error(`\nValidation failed for entry at index ${index}:`);
    errors.forEach((error) => console.error(`- ${error}`));
    console.error('Entry:', JSON.stringify(entry, null, 2));
    return false;
  }

  return true;
}

/**
 * Main validation function.
 */
function validateBenchmarks() {
  console.log('Running benchmark schema validation...');

  const filePath = path.join(
    __dirname,
    '..',
    'services',
    'src',
    'data',
    'framework-benchmarks.json'
  );

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`❌ Error: Failed to read the benchmark file at ${filePath}`);
    process.exit(1);
  }

  let benchmarks: any[];
  try {
    benchmarks = JSON.parse(fileContent);
  } catch (error) {
    console.error('❌ Error: Failed to parse JSON. Please check for syntax errors.');
    process.exit(1);
  }

  if (!Array.isArray(benchmarks)) {
    console.error('❌ Error: The root of the JSON file must be an array.');
    process.exit(1);
  }

  let allValid = true;
  for (let i = 0; i < benchmarks.length; i++) {
    if (!validateEntry(benchmarks[i], i)) {
      allValid = false;
    }
  }

  if (allValid) {
    console.log('✅ Success: All benchmark entries are valid.');
    process.exit(0);
  } else {
    console.error('\n❌ Error: Benchmark schema validation failed.');
    process.exit(1);
  }
}

validateBenchmarks();
