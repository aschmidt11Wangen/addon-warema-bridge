FROM ghcr.io/home-assistant/base:3.19

# Install Node.js
RUN apk add --no-cache nodejs npm

# Copy root filesystem  
COPY rootfs /

# Install Node.js dependencies
WORKDIR /srv
RUN npm install
