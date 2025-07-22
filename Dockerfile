ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js
RUN apk add --no-cache nodejs npm

# Copy root filesystem
COPY rootfs /

# Install dependencies
WORKDIR /srv
RUN npm install

# Run when container starts
CMD ["/srv/bridge.js"]
