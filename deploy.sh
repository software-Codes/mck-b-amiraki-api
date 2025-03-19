#!/bin/bash

# Load environment variables from .env file
if [ ! -f .env ]; then
  echo ".env file not found!"
  exit 1
fi

# Export environment variables, ignoring lines that start with #
export $(grep -v '^#' .env | xargs -d '\n')

# Set variables
APP_NAME="apiinfrahdev"
RESOURCE_GROUP="DevOps"
ENV_NAME="nodebackend-env"
LOCATION="South Africa North"  # Update with your desired Azure region

# Convert .env file to --env-vars arguments
ENV_VARS=$(grep -v '^#' .env | awk -F= '{print "--env-vars", $1"="$2}' | tr '\n' ' ')

# Generate a valid secret name from REGISTRY_URL if it exists
if [ -n "$REGISTRY_URL" ]; then
  SAFE_REGISTRY_URL=$(echo $REGISTRY_URL | sed 's/[^-._a-zA-Z0-9]/-/g')
  ENV_VARS="${ENV_VARS} --env-vars REGISTRY_URL=${SAFE_REGISTRY_URL}"
fi

# Check if az CLI is installed
if ! command -v az &> /dev/null; then
  echo "az CLI could not be found. Please install it and authenticate."
  exit 1
fi

# Authenticate to Azure (optional, if not already authenticated)
az login

# Create the managed environment if it does not exist
az containerapp env up \
  --name $ENV_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Deploy using az containerapp up
az containerapp up \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $ENV_NAME \
  --source . \
  $ENV_VARS

# Check for errors during deployment
if [ $? -ne 0 ]; then
  echo "Deployment failed."
  exit 1
fi

echo "Deployment successful."

# Fetch logs for the deployed container app
az containerapp logs show \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP