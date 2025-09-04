// import { v1alpha2 } from "https://esm.run/@apibara/starknet";
// import Contracts, { EventProcessors, getProcessorKey } from './contracts.ts';
// import { standariseAddress, toBigInt, toHex, toNumber } from "./utils.ts";
// import { ZKLEND_MARKET } from "./constants.ts";
// import { hash } from "https://esm.run/@apibara/starknet";

// // Initiate a filter builder
// const filter: any = {
//     events: [{
//         fromAddress: ZKLEND_MARKET, // STRK
//         keys: [hash.getSelectorFromName("NewReserve")], // Transfer event
//         includeReceipt:false,
//         includeReverted: false,
//     }],
//     header: {weak: false}
// }

// export const config = {
//     streamUrl: "https://mainnet.starknet.a5a.ch",
//     startingBlock: 48668, // deployment block of the contract
//     network: "starknet",
//     finality: "DATA_STATUS_ACCEPTED",
//     filter: filter,
//     sinkType: "postgres",
//     sinkOptions: {
//         noTls: true, // true for private urls, false for public urls
//         tableName: "new_reserve",
//     },
// };

// // Event processor function to store in db
// export default function transform({ header, events }: v1alpha2.Block) {
//     if (!header || !events) return [];

//     const { blockNumber, timestamp } = header;
//     return events.map(({ event, transaction }) => {
//         if (!transaction || !transaction.meta) return null;
//         if (!event || !event.data || !event.keys) return null;
//         const key = standariseAddress(event.keys[0]);
//         if (key != hash.getSelectorFromName("NewReserve")) {
//             return null;
//         }
//         const transactionHash = transaction.meta.hash;

//         if (!event || !event.data || !event.keys) 
//             throw new Error('zkLend:new_reserve:Expected event with data');

//         const claimInfo = {
//             from: toHex(event.data[0]),
//             claimee: toHex(event.data[1]),
//             amount: toBigInt(event.data[2]),
//             eventKey: 'Transfer'
//         }

//         const claim: any = {
//             block_number: toNumber(toBigInt(blockNumber)),
//             txHash: standariseAddress(transactionHash),
//             txIndex: toNumber(transaction.meta?.transactionIndex),
//             eventIndex: toNumber(event.index),
//             contract: claimInfo.from,
//             claimee: claimInfo.claimee,
//             amount:claimInfo.amount.toString(),
//             eventKey: claimInfo.eventKey,
//             timestamp: toNumber(timestamp?.seconds),
//         };
//         return claim;
//     }).filter(e => e != null)
// }