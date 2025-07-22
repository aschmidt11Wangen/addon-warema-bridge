ARG BUILD_FROM
FROM $BUILD_FROM

# Install Node.js
RUN apk add --no-cache nodejs npm

# Copy root filesystem  
COPY rootfs /

# Install Node.js dependencies
WORKDIR /srv
RUN npm install
