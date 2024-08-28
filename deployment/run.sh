#!/bin/bash
echo "Running indexers"
nohup /root/.local/share/apibara/bin/apibara run --allow-env=.env src/strkfarm/deposits-withdraws.ts --sink-id=130 --status-server-address=0.0.0.0:4130 > dep-withdraw.log &
nohup /root/.local/share/apibara/bin/apibara run --allow-env=.env src/strkfarm/harvests.ts --sink-id=140 --status-server-address=0.0.0.0:4140 > harvests.log &
echo "Starting server"
node index.js
