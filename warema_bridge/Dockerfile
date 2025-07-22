ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js and build dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    linux-headers \
    udev

# Copy root filesystem  
COPY rootfs /

# Install Node.js dependencies
WORKDIR /srv
RUN npm cache clean --force && \
    npm config set unsafe-perm true && \
    npm install --omit=dev --no-optional

# Set executable permissions
RUN chmod +x /etc/s6-overlay/s6-rc.d/warema-bridge/run
