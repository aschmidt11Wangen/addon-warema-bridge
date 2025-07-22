ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js and build dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    linux-headers

# Copy root filesystem  
COPY rootfs /

# Set proper permissions for all scripts and directories
RUN find /etc -type f -name "*.sh" -exec chmod +x {} \; && \
    chmod -R 755 /etc/cont-init.d && \
    chmod -R 755 /etc/s6-overlay && \
    chmod +x /etc/cont-init.d/00-warema-config.sh && \
    chmod +x /etc/s6-overlay/s6-rc.d/warema-bridge/run

# Install Node.js dependencies
WORKDIR /srv
RUN npm cache clean --force
RUN npm install --production --no-optional --ignore-scripts
RUN npm rebuild
