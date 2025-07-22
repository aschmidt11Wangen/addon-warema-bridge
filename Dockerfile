FROM ghcr.io/home-assistant/base:3.19

# Install s6-overlay v3 and Node.js
RUN \
  apk add --no-cache \
    nodejs \
    npm

# Copy root filesystem
COPY rootfs /

# Install Node.js dependencies
WORKDIR /srv
RUN npm install

# Build arguments
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION

# Labels
LABEL \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version=${BUILD_VERSION} \
    maintainer="aschmidt11Wangen" \
    org.opencontainers.image.title="${BUILD_NAME}" \
    org.opencontainers.image.description="${BUILD_DESCRIPTION}" \
    org.opencontainers.image.vendor="Home Assistant Community Add-ons" \
    org.opencontainers.image.authors="aschmidt11Wangen" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://github.com/aschmidt11Wangen/addon-warema-bridge" \
    org.opencontainers.image.source="https://github.com/aschmidt11Wangen/addon-warema-bridge" \
    org.opencontainers.image.documentation="https://github.com/aschmidt11Wangen/addon-warema-bridge/blob/main/README.md" \
    org.opencontainers.image.created=${BUILD_DATE} \
    org.opencontainers.image.revision=${BUILD_REF} \
    org.opencontainers.image.version=${BUILD_VERSION}
