import "dotenv/config";
import { EkuboCLVault, EkuboCLVaultStrategies, getMainnetConfig, Global, PricerFromApi } from "@strkfarm/sdk";
import { writeFileSync } from "fs";
const pLimit = require('p-limit');

let count = 0;
async function getPrices(strategyClas: EkuboCLVault, blockNumber: number) {
    let retry = 0;
    const MAX_RETRY = 5;
    while (retry < MAX_RETRY) {
        try {
            const result = await strategyClas.getCurrentPrice(blockNumber);
            count += 1;
            if (count % 100 == 0) {
                console.log(`Processed ${count} blocks, block: ${blockNumber}`);
            }
            return {blockNumber, result};
        } catch (error) {
            retry++;
            if (retry >= MAX_RETRY) {
                console.error(`Failed to get price for block ${blockNumber} after ${MAX_RETRY} retries`);
                return {blockNumber, result: null};
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * retry));
            return {blockNumber, result: null};
        }
    }
}
export async function main() {
    const strategy1 = EkuboCLVaultStrategies[0];

    const config = getMainnetConfig(process.env.RPC_URL!);
    const pricer = new PricerFromApi(config, Global.getDefaultTokens());
    const strategyClas = new EkuboCLVault(config, pricer, strategy1);

    const startBlock = 1209881;
    const endBlock = 2363888;
    // const endBlock = 1210000;

    const limit = pLimit(10);

    const proms: Promise<any>[] = [];
    for (let block = startBlock; block <= endBlock; block += 50) {
        proms.push(limit(async () => {
            return await getPrices(strategyClas, block);
         }));
    }
    const finalResults = await Promise.all(proms);
    writeFileSync(`./backup/ekubo_xstrk_prices.json`, JSON.stringify(finalResults, null, 2));
}

if (require.main === module) {
    main();
}