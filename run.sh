#!/bin/bash
echo "Running dep-withdraw and harvests"
nohup yarn run start-dep-withdraw > dep-withdraw.log &
nohup yarn run start-harvests > harvests.log &
echo "Running dep-withdraw and harvests"
tail -100f dep-withdraw.log
