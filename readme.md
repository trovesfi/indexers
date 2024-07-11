# APIbara Indexer to read STRK claims

Requirements:
1. apibara cli
2. Node 20+
3. Recommended package manager: yarn

### Install
`yarn`

### Development
1. Copy .env.sample to .env and configure it

2. Run: `apibara run --allow-env=.env src/indexer.ts -A dna_xxx --sink-id 1`
sink-id can be anything, but use same always

SyncID can be generated like this `sn.num.getDecimalString(sn.shortString.encodeShortString('subscriptions'))`

### Production
