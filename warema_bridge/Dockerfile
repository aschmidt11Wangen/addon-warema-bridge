ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js and dependencies
RUN apk add --no-cache nodejs npm python3 make g++

# Copy root filesystem  
COPY rootfs /

# Install Node.js dependencies
WORKDIR /srv
RUN npm cache clean --force && npm install --production

# Set executable permissions
RUN chmod +x /etc/s6-overlay/s6-rc.d/warema-bridge/run
