#!/usr/bin/with-contenv bashio

# Warema Bridge initialization script
bashio::log.info "Initializing Warema Bridge add-on..."

# Check if config exists
if ! bashio::config.exists; then
    bashio::log.warning "No configuration found, using defaults"
fi

bashio::log.info "Warema Bridge initialization completed"