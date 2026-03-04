#!/usr/bin/env bun
/**
 * Validates YAML files passed as arguments.
 * Usage: bun run scripts/validate-yaml.ts file1.yml file2.yml
 */

import { readFileSync } from "fs";
import { parse } from "yaml";

const files = process.argv.slice(2);

if (files.length === 0) {
  console.log("No YAML files to validate");
  process.exit(0);
}

let hasErrors = false;

for (const file of files) {
  try {
    const content = readFileSync(file, "utf-8");
    parse(content);
    console.log(`✓ ${file}`);
  } catch (error: any) {
    console.error(`✗ ${file}: ${error.message}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log(`\nAll ${files.length} YAML files valid`);
