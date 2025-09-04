// import { standariseAddress, toBigInt, toHex, toNumber } from "../utils.ts";
// import { isTLS } from "../strkfarm/constants.ts";

// // Initiate a filter builder
// const eventKey = "0x238a25785a13ab3138feb8f8f517e5a21a377cc1ad47809e9fd5e76daf01df7" // "Rebalance"
// const filter: any = {
//     events: [{
//         fromAddress: "0x04c0a5193d58f74fbace4b74dcf65481e734ed1714121bdc571da345540efa05",
//         keys: [eventKey],
//         includeReceipt:false,
//         includeReverted: false,
//         includeTransaction: false,
//     }],
//     header: {weak: true}
// }

// export const config = {
//     streamUrl: "https://mainnet.starknet.a5a.ch",
//     startingBlock: 500000, // deployment block of the contract
//     network: "starknet",
//     finality: "DATA_STATUS_ACCEPTED",
//     filter: filter,
//     sinkType: "parquet",
//     sinkOptions: {
//         // noTls: isTLS, // true for private urls, false for public urls
//         // tableName: "zklend_liquidations",
//         outputDir: "./default2",
//         batchSize: 5000
//     },
// };


// // Event processor function to store in db
// export default function transform({ header, events }: v1alpha2.Block) {
//     if (!header || !events) return [];

//     const { blockNumber, timestamp } = header;
//     return events.map(({ event }: {event: any}) => {
//         if (!event || !event.data || !event.keys) return null;
//         const key = standariseAddress(event.keys[0]);
//         if (key != eventKey) {
//             return null;
//         }

//         if (!event || !event.data || !event.keys) 
//             throw new Error('zkLend:liquidations:Expected event with data');

//         const info = {
//             user: toHex(event.data[1]),
//             debt_token: toHex(event.data[2]),
//             debt_face_amount: toBigInt(event.data[4]).toString(),
//         }

//         console.log(info)

//         const rebalance: any = {
//             user: info.user,
//             debt_token: info.debt_token,
//             debt_face_amount: info.debt_face_amount,
//         };
//         console.log(rebalance)
//         return rebalance;
//     }).filter(e => e != null)
// }