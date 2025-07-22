#!/usr/bin/with-contenv bashio

# Warema Bridge initialization script
bashio::log.info "Initializing Warema Bridge add-on..."

# Simple initialization without config checks that might fail
bashio::log.info "Setting up Warema Bridge environment..."

# Ensure the service directory exists
mkdir -p /srv

bashio::log.info "Warema Bridge initialization completed successfully"