#!/bin/bash

# deploy-and-install.sh - Automates deployment and installation upgrade for Forge apps.

echo "🚀 Starting Deployment and Installation workflow..."

# 1. Deploy the app
echo "📦 Step 1: Deploying app..."
forge deploy
DEPLOY_EXIT_CODE=$?

if [ $DEPLOY_EXIT_CODE -ne 0 ]; then
  echo "❌ Deployment failed! Aborting installation."
  exit $DEPLOY_EXIT_CODE
fi

echo "✅ Deployment successful!"

# 2. Install/Upgrade the app
echo "🛠️ Step 2: Upgrading installation (to apply new permissions/modules)..."
forge install --upgrade
INSTALL_EXIT_CODE=$?

if [ $INSTALL_EXIT_CODE -ne 0 ]; then
  echo "❌ Installation upgrade failed!"
  exit $INSTALL_EXIT_CODE
fi

echo "🎉 Workflow completed successfully! Your app is deployed and upgraded."
exit 0