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
    
    log_info "Setting up service principal for GitHub integration: $sp_name"
    
    # Create a new service principal with Contributor role
    log_info "Creating service principal: $sp_name"
    
    # Create or update the service principal and assign Contributor role
    local sp_output
    sp_output=$(az ad sp create-for-rbac \
        --name "$sp_name" \
        --role "Contributor" \
        --scopes "/subscriptions/${PROJECT_SUBSCRIPTION_ID}/resourceGroups/${PROJECT_RESOURCE_GROUP}" \
        --sdk-auth \
        -o json)
    
    if [ -z "$sp_output" ]; then
        log_error "Failed to create service principal"
        exit 1
    fi
    
    # Extract the client ID (app ID) from the service principal output
    CLIENT_ID=$(echo "$sp_output" | jq -r '.clientId')
    
    if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" == "null" ]; then
        log_error "Failed to extract client ID from service principal"
        exit 1
    fi
    
    log_success "Service principal created/updated successfully: $CLIENT_ID"
    
    # Export service principal details for later use
    export AZURE_CREDENTIALS="$sp_output"
    export SERVICE_PRINCIPAL_ID="$CLIENT_ID"
    
    # Wait a moment for AAD propagation
    log_info "Waiting for AAD propagation (30 seconds)..."
    sleep 30
}

# Prepare Azure Container Registry
prepare_container_registry() {
    local registry_name="${ENVIRONMENT_PREFIX}${PROJECT_PREFIX}contregistry"
    
    log_info "Checking Azure Container Registry: $registry_name"
    
    # Check if registry exists, create if not
    if ! az acr show --name "$registry_name" --resource-group "$PROJECT_RESOURCE_GROUP" &>/dev/null; then
        log_warning "Container Registry does not exist. Creating..."
        az acr create \
            --name "$registry_name" \
            --resource-group "$PROJECT_RESOURCE_GROUP" \
            --sku Basic \
            --admin-enabled true
    fi

    # Login to ACR
    az acr login --name "$registry_name"
    
    # Grant service principal ACR pull rights
    if [ -n "${SERVICE_PRINCIPAL_ID:-}" ]; then
        log_info "Granting ACR pull rights to service principal"
        az role assignment create \
            --assignee "$SERVICE_PRINCIPAL_ID" \
            --scope "/subscriptions/${PROJECT_SUBSCRIPTION_ID}/resourceGroups/${PROJECT_RESOURCE_GROUP}/providers/Microsoft.ContainerRegistry/registries/${registry_name}" \
            --role "AcrPull" || log_warning "Could not assign AcrPull role, may already exist"
    fi
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
    local registry_name="${ENVIRONMENT_PREFIX}${PROJECT_PREFIX}contregistry"
    local registry_url="${registry_name}.azurecr.io"
    local repo_url="https://github.com/mckBishopAmirakiChurch-App/backendclone"
    local branch="main"

    log_info "Deploying Container App: $container_app_name"
    
    # Get ACR credentials
    local acr_username
    local acr_password
    acr_username=$(az acr credential show --name "$registry_name" --query "username" -o tsv)
    acr_password=$(az acr credential show --name "$registry_name" --query "passwords[0].value" -o tsv)
    
    # Set up GitHub credentials
    if [ -n "${SERVICE_PRINCIPAL_ID:-}" ]; then
        log_info "Using service principal for GitHub integration"
        
        # Create or update the container app with GitHub integration
        az containerapp up \
            --name "$container_app_name" \
            --resource-group "$PROJECT_RESOURCE_GROUP" \
            --environment "$environment_name" \
            --repo "$repo_url" \
            --branch "$branch" \
            --registry-server "$registry_url" \
            --registry-username "$acr_username" \
            --registry-password "$acr_password" \
            --service-principal-client-id "$SERVICE_PRINCIPAL_ID" \
            --ingress external \
            --target-port 3000
    else
        # Fallback if service principal setup failed
        log_warning "Service principal not available, using standard deployment"
        az containerapp up \
            --name "$container_app_name" \
            --resource-group "$PROJECT_RESOURCE_GROUP" \
            --environment "$environment_name" \
            --repo "$repo_url" \
            --branch "$branch" \
            --registry-server "$registry_url" \
            --registry-username "$acr_username" \
            --registry-password "$acr_password" \
            --ingress external \
            --target-port 3000
    fi

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
    setup_service_principal  # Create service principal first
    prepare_container_registry
    prepare_container_apps_environment
    deploy_container_app

    log_success "Deployment completed successfully"
    log_info "Detailed logs available at: $log_file"
}

# Execute main function with error handling
main "$@"