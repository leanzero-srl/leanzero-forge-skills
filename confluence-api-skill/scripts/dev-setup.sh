#!/bin/bash

# dev-setup.sh - Starts the Forge development tunnel.

ENV_ARG=""

# Parse arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    -e|--environment) ENV_ARG="$2"; shift ;;
    *) echo "Unknown parameter passed: $1"; exit 1 ;;
  esac
  shift
done

echo "🚀 Starting Forge development tunnel..."

if [ -n "$ENV_ARG" ]; then
  echo "📍 Targeting environment: $ENV_ARG"
  forge tunnel -e "$ENV_ARG"
else
  echo "📍 Targeting default (development) environment"
  forge tunnel
fi

if [ $? -ne 0 ]; then
  echo "❌ Failed to start Forge tunnel."
  exit 1
fi

echo "✅ Tunnel is running. You can now proceed with development."