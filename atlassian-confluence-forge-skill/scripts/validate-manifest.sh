#!/bin/bash

# validate-manifest.sh - Validates the Forge manifest.yml for errors.

echo "🔍 Running Forge manifest validation (lint)..."

# Run forge lint and capture output
# We redirect stderr to stdout so we can capture everything
LINT_OUTPUT=$(forge lint 2>&1)
LINT_EXIT_CODE=$?

if [ $LINT_EXIT_CODE -eq 0 ]; then
  echo "✅ Manifest is valid!"
  exit 0
else
  echo "❌ Manifest validation failed!"
  echo "--------------------------------------------------"
  echo "Summary of errors found:"
  
  # Extract error lines. Forge lint output usually looks like:
  # path/to/file:line:column: error message
  # We'll use grep to find lines that look like errors.
  echo "$LINT_OUTPUT" | grep -E "error|warning" || echo "No specific error/warning messages parsed, but lint failed."
  
  echo "--------------------------------------------------"
  echo "HINT: Check the line numbers above and correct your manifest.yml."
  echo "You can also run 'forge deploy' to see more detailed errors during deployment."
  exit 1
fi