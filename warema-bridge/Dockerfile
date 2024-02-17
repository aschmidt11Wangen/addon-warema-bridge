ARG BUILD_FROM=alpine:3.18.6
FROM ${BUILD_FROM}

# Setup base
RUN apk add --no-cache npm

# Copy root filesystem
COPY rootfs/srv /srv

WORKDIR /srv

RUN apk add --no-cache --virtual .build-deps python3 make g++ linux-headers \
    && npm ci --only=production \
    && apk del --no-cache --purge .build-deps \
    && rm -rf /root/.npm /root/.cache

ENTRYPOINT ["/usr/bin/node", "/srv/bridge.js"]
