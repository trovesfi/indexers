#!/bin/bash
# Install grpcurl if not installed
if ! command -v grpcurl >/dev/null 2>&1; then
    curl -sSL "https://github.com/fullstorydev/grpcurl/releases/download/v1.8.6/grpcurl_1.8.6_linux_x86_64.tar.gz" | tar -xz -C /usr/local/bin
fi

echo "Running indexers"
nohup /root/.local/share/apibara/bin/apibara run --allow-env=.env src/strkfarm/deposits-withdraws.ts --sink-id=130 --status-server-address=0.0.0.0:4130 > dep-withdraw.log &
nohup /root/.local/share/apibara/bin/apibara run --allow-env=.env src/strkfarm/harvests.ts --sink-id=140 --status-server-address=0.0.0.0:4140 > harvests.log &
echo "Starting server"
node index.js
