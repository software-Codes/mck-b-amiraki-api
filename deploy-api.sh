#!/bin/bash

# Enhanced Deployment Script for Azure Container Apps with Robust Error Handling and Logging

# Strict mode for better error handling
set -euo pipefail

# Define color codes for enhanced readability
declare -r YELLOW='\033[0;33m'
declare -r RED='\033[0;31m'
declare -r GREEN='\033[0;32m'
declare -r BLUE='\033[0;34m'
declare -r NC='\033[0m' # No Color

# Logging and error handling functions
log_error() {
    echo -e "${RED}[ERROR] $*${NC}" >&2
}

log_info() {
    echo -e "${BLUE}[INFO] $*${NC}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS] $*${NC}"
}

log_warning() {
    echo -e "${YELLOW}[WARNING] $*${NC}"
}

# Error handler
handle_error() {
    local line_number=$1
    local command=$2
    log_error "Error occurred at line $line_number: $command"
    exit 1
}

# Trap errors
trap 'handle_error $LINENO "$BASH_COMMAND"' ERR

# Configuration and Initialization
initialize_configuration() {
    # Traverse up the directory tree to find globalenv.config
    local dir
    dir=$(pwd)
    while [[ "$dir" != "/" ]]; do
        if [[ -f "$dir/globalenv.config" ]]; then
            # shellcheck source=/dev/null
            source "$dir/globalenv.config"
            return 0
        fi
        dir=$(dirname "$dir")
    done

    log_error "globalenv.config not found"
    exit 1
}

# Validate required environment variables
validate_configuration() {
    local required_vars=(
        "ENVIRONMENT_PREFIX"
        "PROJECT_PREFIX"
        "PROJECT_LOCATION"
        "LOG_FOLDER"
        "PROJECT_RESOURCE_GROUP"
        "PROJECT_SUBSCRIPTION_ID"
    )

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable $var is not set"
            return 1
        fi
    done
}

# Azure authentication and subscription setup
setup_azure_context() {
    log_info "Checking Azure CLI authentication"
    
    # Login if not already authenticated
    if ! az account show &>/dev/null; then
        log_warning "Not logged in to Azure CLI. Initiating login..."
        az login
    fi

    # Set the target subscription
    log_info "Setting Azure subscription to ${PROJECT_SUBSCRIPTION_ID}"
    az account set --subscription "${PROJECT_SUBSCRIPTION_ID}"

    # Verify subscription is set correctly
    local current_subscription
    current_subscription=$(az account show --query id -o tsv)
    if [[ "$current_subscription" != "$PROJECT_SUBSCRIPTION_ID" ]]; then
        log_error "Failed to set Azure subscription. Current: $current_subscription, Expected: $PROJECT_SUBSCRIPTION_ID"
        return 1
    fi
}

# Create or get service principal for GitHub integration
setup_service_principal() {
    local sp_name="${ENVIRONMENT_PREFIX}-${PROJECT_PREFIX}-github-sp"
    local sp_json
    
    log_info "Setting up service principal for GitHub integration: $sp_name"
    
    # Check if service principal exists
    if sp_json=$(az ad sp list --display-name "$sp_name" --query "[0]" -o json 2>/dev/null) && [ "$sp_json" != "null" ]; then
        log_info "Service principal already exists, retrieving details..."
        # Get the object ID from the existing service principal
        local sp_id
        sp_id=$(echo "$sp_json" | jq -r '.id')
        
        # Assign necessary roles if not already assigned
        log_info "Ensuring service principal has necessary role assignments..."
        
        # Check if contributor role is assigned to resource group
        if ! az role assignment list --assignee "$sp_id" --scope "/subscriptions/${PROJECT_SUBSCRIPTION_ID}/resourceGroups/${PROJECT_RESOURCE_GROUP}" --query "[?roleDefinitionName=='Contributor']" | grep -q "Contributor"; then
            log_info "Assigning Contributor role to service principal on resource group ${PROJECT_RESOURCE_GROUP}"
            az role assignment create --assignee "$sp_id" --role Contributor --scope "/subscriptions/${PROJECT_SUBSCRIPTION_ID}/resourceGroups/${PROJECT_RESOURCE_GROUP}"
        fi
        
        # Return existing service principal ID
        SP_ID="$sp_id"
        log_success "Using existing service principal $sp_name"
    else
        log_info "Creating new service principal: $sp_name"
        # Create a new service principal with Contributor role
        local sp_output
        sp_output=$(az ad sp create-for-rbac --name "$sp_name" --role Contributor --scopes "/subscriptions/${PROJECT_SUBSCRIPTION_ID}/resourceGroups/${PROJECT_RESOURCE_GROUP}" -o json)
        
        # Extract and store service principal ID
        SP_ID=$(echo "$sp_output" | jq -r '.appId')
        SP_PASSWORD=$(echo "$sp_output" | jq -r '.password')
        SP_TENANT=$(echo "$sp_output" | jq -r '.tenant')
        
        log_success "Created new service principal $sp_name"
        
        # Wait for AAD propagation
        log_info "Waiting for AAD propagation (30 seconds)..."
        sleep 30
    fi
    
    # Export service principal details for use in deployment
    export SP_ID
    
    log_info "Service principal setup complete"
}

# Prepare Azure Container Registry
prepare_container_registry() {
    local registry_name="${ENVIRONMENT_PREFIX}${PROJECT_PREFIX}contregistry"
    
    log_info "Checking Azure Container Registry: $registry_name"
    
    # Check if registry exists, create if not
    if ! az acr show --name "$registry_name" &>/dev/null; then
        log_warning "Container Registry does not exist. Creating..."
        az acr create \
            --name "$registry_name" \
            --resource-group "$PROJECT_RESOURCE_GROUP" \
            --sku Basic \
            --admin-enabled true
    fi

    # Login to ACR
    az acr login --name "$registry_name"
}

# Prepare Container Apps Environment
prepare_container_apps_environment() {
    local environment_name="${ENVIRONMENT_PREFIX}-${PROJECT_PREFIX}-BackendContainerAppsEnv"
    local container_app_name="${ENVIRONMENT_PREFIX}-${PROJECT_PREFIX}-worker"
    local registry_url="${ENVIRONMENT_PREFIX}${PROJECT_PREFIX}contregistry.azurecr.io"

    log_info "Preparing Container Apps Environment: $environment_name"

    # Create Container Apps Environment if not exists
    if ! az containerapp env show --name "$environment_name" --resource-group "$PROJECT_RESOURCE_GROUP" &>/dev/null; then
        log_warning "Container Apps Environment does not exist. Creating..."
        az containerapp env create \
            --name "$environment_name" \
            --resource-group "$PROJECT_RESOURCE_GROUP" \
            --location "$PROJECT_LOCATION"
    fi

    # Output environment and app details for reference
    echo "Environment Name: $environment_name"
    echo "Container App Name: $container_app_name"
    echo "Registry URL: $registry_url"
}

# Build and deploy container
deploy_container_app() {
    local environment_name="${ENVIRONMENT_PREFIX}-${PROJECT_PREFIX}-BackendContainerAppsEnv"
    local container_app_name="${ENVIRONMENT_PREFIX}-${PROJECT_PREFIX}-worker"
    local registry_url="${ENVIRONMENT_PREFIX}${PROJECT_PREFIX}contregistry.azurecr.io"
    local repo_url="https://github.com/mckBishopAmirakiChurch-App/backendclone"
    local branch="main"

    log_info "Deploying Container App: $container_app_name"

    # Deploy container app with service principal
    log_info "Deploying Container App with service principal"
    
    # Use service principal ID for deployment
    az containerapp up \
        --name "$container_app_name" \
        --resource-group "$PROJECT_RESOURCE_GROUP" \
        --environment "$environment_name" \
        --repo "$repo_url" \
        --branch "$branch" \
        --registry-server "$registry_url" \
        --ingress external \
        --target-port 3000 \
        --service-principal-id "$SP_ID"

    # Update container app settings
    log_info "Configuring Container App scaling and resources"
    az containerapp update \
        --name "$container_app_name" \
        --resource-group "$PROJECT_RESOURCE_GROUP" \
        --cpu 0.25 \
        --memory 0.5Gi \
        --min-replicas 1 \
        --max-replicas 10
}

# Main deployment workflow
main() {
    # Configuration and setup must happen FIRST
    initialize_configuration
    validate_configuration

    # Now safe to use LOG_FOLDER
    local timestamp
    timestamp=$(date +"%Y%m%d_%H%M%S")
    local log_file="${LOG_FOLDER}/deploy_worker_${timestamp}.log"

    # Redirect output to log file and console
    exec > >(tee -a "$log_file") 2>&1

    log_info "Starting Container App Deployment Workflow"

    # Azure deployment steps
    setup_azure_context
    setup_service_principal  # Add service principal setup before other Azure resources
    prepare_container_registry
    prepare_container_apps_environment
    deploy_container_app

    log_success "Deployment completed successfully"
    log_info "Detailed logs available at: $log_file"
}

# Execute main function with error handling
main "$@"