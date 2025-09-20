import "dotenv/config";
import { hash, num, RpcProvider, shortString } from "starknet";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { PrismaClient, raw_price_events } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const PRAGMA_ADDRESS = '0x02a85bd616f912537c50a49a4076db02c00b29b2cdc8a197ce92ed1837fa875b';

const provider = new RpcProvider({
    nodeUrl: process.env.RPC_URL!,
})

async function fetchPriceEvents() {
    await recursiveEventFetch(PRAGMA_ADDRESS, [hash.getSelectorFromName("SubmittedSpotEntry")], 1000, 1550294, 1609881, undefined);
}

async function recursiveEventFetch(address: string, keys: string[], chunk_size: number, start_block: number, end_block: number, continuation_token: string | undefined, allEvents: any[] = []) {
    let retry = 0;
    const MAX_RETRY = 5;
    while (retry < MAX_RETRY) {
        try {
            const events = await provider.getEvents({
                address: address,
                keys: [keys],
                chunk_size: chunk_size,
                from_block: {
                    block_number: start_block,
                },
                to_block: {
                    block_number: end_block,
                },
                continuation_token: continuation_token,
            })

            writeFileSync(`./backup/events_${start_block}_${end_block}_${events.continuation_token}.json`, JSON.stringify(events, null, 2));
            console.log(`Fetched ${events.events.length} events, continuation token: ${events.continuation_token}`);
            if (events.continuation_token) {
                const _newEvents = await recursiveEventFetch(address, keys, chunk_size, start_block, end_block, events.continuation_token, allEvents);
                allEvents.push(..._newEvents);
            }
            return allEvents;
        } catch (error) {
            console.error(error);
            retry++;
            if (retry >= MAX_RETRY) {
                console.error(`Failed to fetch events after ${MAX_RETRY} retries`);
                return allEvents;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * retry));
        }
    }
    return allEvents;
}

/**
 * Read all files from backup one by one
 * Maintains a map of <timestamp, {price, pair_id}>
 * timestamp is rounded down to 15 minutes
 * - To compute median, a history of prices is maintained for given pair_id and timestamp_15min
 * - Everytime record is updated in this history, new median price is computed and stored in the original map
 * - once every 500 blocks, history older than 7days relative to current block timestamp is deleted (to reduce ram usage)
 * - Finally returns the original map
 */
function getTimestampWiseMedianPriceEvent() {
    // string is pair_id-timestamp_15min
    const map: Record<string, {price: Decimal, block_number: number}> = {};

    // string is <pair_id>-<timestamp_15min>
    const tempMediamComputationMap = new Map<string, { prices: Decimal[]} >();
    const files = readdirSync('./backup');
    for (const file of files) {
        console.log(`Reading file ${file}`);
        if (!file.startsWith('events')) continue;
        const events = readFileSync(`./backup/${file}`, 'utf8');
        const eventsJson = JSON.parse(events);
        for (const event of eventsJson.events) {
            const timestamp = Math.floor(Number(num.getDecimalString(event.data[0])) / 900) * 900;
            const pair_id = event.data[4];
            const price = new Decimal(num.getDecimalString(event.data[3]));
            const key = `${pair_id}-${timestamp}`;
            if (tempMediamComputationMap.has(key)) {
                tempMediamComputationMap.get(key)!.prices.push(price);
            } else {
                tempMediamComputationMap.set(key, {prices: [price]});
            }
            const medianPrice = tempMediamComputationMap.get(key)!.prices.sort((a, b) => a.minus(b).toNumber())[Math.floor(tempMediamComputationMap.get(key)!.prices.length / 2)];
            map[key] = {price: medianPrice, block_number: event.block_number};
            // writeFileSync(`./backup/median_price_map.json`, JSON.stringify(map, null, 2));
            
            // const allKeys = Array.from(tempMediamComputationMap.keys())
            //     .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))
            //     .filter(key => Number(key.split('-')[1]) < timestamp - 7 * 24 * 60 * 60);
            // for (const key of allKeys) {
            //     tempMediamComputationMap.delete(key);
            // }
        }
    }
    writeFileSync(`./backup/median_price_map.json`, JSON.stringify(map, null, 2));
}

async function readAndInsertMedianPriceMap() {
    const prisma = new PrismaClient();
    const map = readFileSync(`./backup/median_price_map.json`, 'utf8');
    const mapJson = JSON.parse(map);
    let shouldSkip = false;
    let skipTill = '0x5753544554482f555344-1741986900'
    let count = 0;
    for (const key in mapJson) {
        count += 1;
        if (shouldSkip && key != skipTill) {
            continue;
        }
        shouldSkip = false;
        const {price, block_number} = mapJson[key];
        const [pair_id, timestamp] = key.split('-');
        console.log(`Inserting ${key} with price ${price} and block_number ${block_number}`);
        try {
            await prisma.raw_price_events.upsert({
                where: {
                    event_id: {
                        block_number: block_number,
                        tx_index: count,
                        event_index: 0,
                    }
                },
                update: {price, block_number, tx_index: count, event_index: 0, pair_id, volume: new Decimal(0)},
                create: {pair_id, price, timestamp: Number(timestamp), block_number, tx_index: count, event_index: 0, tx_hash: '', source: '', publisher: '', volume: new Decimal(0)},
            });
        } catch (error: any) {
            if (error.message.includes('An operation failed because it depends on')) {
                // cool
            } else {
                console.error(error, key);
                throw error;
            }
        }
    }
}

// async function readAll() {
//     const prisma = new PrismaClient();
  
//     const 

//     // load all files from backup, sequentially
//     const files = await readdirSync('./backup');
//     for (const file of files) {
//         console.log(`Reading file ${file}`);
//         const events = await readFileSync(`./backup/${file}`, 'utf8');
//         // const eventsJson = JSON.parse(events);
//         // allEvents.push(...eventsJson.events);
//         await prisma.$transaction(async (tx) => {
//             const eventsJson = JSON.parse(events);
//             for (const event of eventsJson.events) {
//                 const txIndex = blockTxIndexMap.get(event.block_number.toString()) || 0;
//                 blockTxIndexMap.set(event.block_number.toString(), txIndex + 1);
//                 const data: Omit<raw_price_events, 'id'> = {
//                     block_number: event.block_number,
//                     tx_index: txIndex,
//                     event_index: 0,
//                     tx_hash: event.transaction_hash,
//                     timestamp: Number(num.getDecimalString(event.data[0])),
//                     source: shortString.decodeShortString(event.data[1]).replaceAll(/\u0000/g, '').trim(),
//                     publisher: shortString.decodeShortString(event.data[2]).replaceAll(/\u0000/g, '').trim(),
//                     price: new Decimal(num.getDecimalString(event.data[3])),
//                     pair_id: event.data[4],
//                     volume: new Decimal(num.getDecimalString(event.data[5])),
//                 }
//                 try {
//                     await tx.raw_price_events.upsert({
//                         where: {
//                             event_id: {
//                                 block_number: data.block_number,
//                                 tx_index: data.tx_index,
//                                 event_index: data.event_index,
//                             }
//                         },
//                         update: data,
//                         create: data,
//                     });
//                     console.log(`Inserted event ${data.block_number}-${data.tx_index}-${data.event_index}, pair_id: ${shortString.decodeShortString(data.pair_id)}`);
//                 } catch (error: any) {
//                     // if (['0x53544554482f555344', '0x4441492f555344', '0x4c5553442f555344'].includes(data.pair_id)) {
//                     if (error.message.includes('An operation failed because it depends on')) {
//                         // cool
//                     } else {
//                         console.error(error, data, shortString.decodeShortString(data.pair_id));
//                         throw error;
//                     }
//                 }
//             }
//         });
//     }
// }

async function collateAndInsertEvents() {
    // const allEvents = await readAll();
    const prisma = new PrismaClient();
    
    // sort by block number, tx index, event index
    // allEvents.sort((a, b) => {
    //     return a.block_number - b.block_number || a.tx_index - b.tx_index || a.event_index - b.event_index;
    // });

    // // insert in batches of 1000
    // for (let i = 0; i < allEvents.length; i += 1000) {
    //     console.log(`Inserting batch ${i / 1000 + 1} of ${Math.ceil(allEvents.length / 1000)}`);
    //     const batch = allEvents.slice(i, i + 1000);
    //     await prisma.raw_price_events.createMany({
    //         data: batch,
    //     });
    // }
}

if (require.main === module) {
    // fetchPriceEvents();
    // collateAndInsertEvents();
    // getTimestampWiseMedianPriceEvent();
    readAndInsertMedianPriceMap();
}