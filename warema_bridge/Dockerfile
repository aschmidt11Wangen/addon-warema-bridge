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

# Install Node.js dependencies
WORKDIR /srv
RUN npm cache clean --force
RUN npm install --production --no-optional --ignore-scripts
RUN npm rebuild

# Set executable permissions for s6-overlay scripts
RUN chmod +x /etc/cont-init.d/00-warema-config.sh
RUN chmod +x /etc/s6-overlay/s6-rc.d/warema-bridge/run
