#!/bin/bash
# Install grpcurl if not installed
if ! command -v grpcurl >/dev/null 2>&1; then
    curl -sSL "https://github.com/fullstorydev/grpcurl/releases/download/v1.8.6/grpcurl_1.8.6_linux_x86_64.tar.gz" | tar -xz -C /usr/local/bin
fi

echo "Running indexers"
# /usr/bin/supervisord -c /app/supervisord.conf

echo "Starting common indexer with PM2..."

pm2 start "npx apibara build && npx apibara start --indexer common_v2" --name "common_v2.indexer"

echo "Common indexer has been started with PM2."

# echo "Sleeping 10s"
# sleep 10
# cat dep-withdraw.log
# echo "==================================================="
# cat harvests.log

echo "Starting server"
node index.js
