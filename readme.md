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


# GraphQL Setup
We use TypeGraphQL and Prisma to setup the GraphQL server.

1. https://www.prisma.io/graphql  
2. https://typegraphql.com/docs/bootstrap.html#create-an-http-graphql-endpoint

# WSL setup
1. Ensure localhost postgres is running, If you have proper setup, running this should start your postgres `sudo service postgresql start`