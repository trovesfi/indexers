#!/bin/bash

# run the common indexer
echo "Starting common indexer with PM2..."

pm2 start "npx apibara build && npx apibara start --indexer common_v2" --name "common_v2.indexer"

echo "Common indexer has been started with PM2."

echo "Starting server"
node index.js