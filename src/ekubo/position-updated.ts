import { standariseAddress, toBigInt, toHex, toNumber } from "../utils.ts";
import { isTLS } from "./constants.ts";

const positionUpdatedKey = standariseAddress("0x02d7d9a5e2e7c2d7d9a5e2e7c2d7d9a5e2e7c2d7d9a5e2e7c2d7d9a5e2e7c2d7d9a5e2e7c2"); // "PositionUpdated"

function processPositionUpdated(data: any[]) {
  const lowerBoundVal = data[8];
  const lowerBoundValSign = standariseAddress(data[9]);
  const upperBoundVal = data[10];
  const upperBoundValSign = standariseAddress(data[11]);

  const lower_bound =
    lowerBoundValSign == "0x0"
      ? toBigInt(lowerBoundVal).toString()
      : -toBigInt(lowerBoundVal).toString();
  const upper_bound =
    upperBoundValSign == "0x0"
      ? toBigInt(upperBoundVal).toString()
      : -toBigInt(upperBoundVal).toString();

  const amount0Val = data[14];
  const amount0ValSign = standariseAddress(data[15]);
  const amount1Val = data[16];
  const amount1ValSign = standariseAddress(data[17]);

  const amount0 =
    amount0ValSign == "0x0"
      ? toBigInt(amount0Val).toString()
      : -toBigInt(amount0Val).toString();
  const amount1 =
    amount1ValSign == "0x0"
      ? toBigInt(amount1Val).toString()
      : -toBigInt(amount1Val).toString();

  const liquidityDelta = data[12];
  const liquidityDeltaSign = standariseAddress(data[13]);

  const liquidity_delta =
    liquidityDeltaSign == "0x0"
      ? toBigInt(liquidityDelta).toString()
      : -toBigInt(liquidityDelta).toString();

  return {
    locker: standariseAddress(data[1]),
    token0: standariseAddress(data[2]),
    token1: standariseAddress(data[3]),
    fee: toBigInt(data[4]).toString(),
    tick_spacing: toBigInt(data[5]).toString(),
    extension: standariseAddress(data[6]),
    salt: toBigInt(data[7]).toString(),
    lower_bound,
    upper_bound,
    liquidity_delta,
    amount0,
    amount1,
  };
}

const CONTRACTS: any = {
  positionUpdated: {
    contracts: [
      {
        address: standariseAddress(
          "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b"
        ),
        asset: "",
      },
    ],
    processor: processPositionUpdated
  }
}

// Initiate a filter builder
const filter: any = {
  events: [],
  header: {weak: false}
}

Object.keys(CONTRACTS).map((key: string) => {
  const info = CONTRACTS[key];
  info.contracts.forEach((c: any) => {
    filter.events.push({
      fromAddress: c.address,
      keys: [positionUpdatedKey],
      includeReceipt: false,
      includeReverted: false,
    })
  })
})

export const config = {
  streamUrl: "https://mainnet.starknet.a5a.ch",
  startingBlock: Number(Deno.env.get("START_BLOCK") || 0),
  network: "starknet",
  finality: "DATA_STATUS_ACCEPTED",
  filter: filter,
  sinkType: "postgres",
  sinkOptions: {
    noTls: isTLS,
    tableName: "position_updated",
  },
};

// Event processor function to store in db
export default function transform({ header, events }: any) {
  if (!header || !events) return [];

  const { blockNumber, timestamp } = header;
  
  return events.map(({ event, transaction }: any) => {
    if (!transaction || !transaction.meta) return null;
    if (!event || !event.data || !event.keys) return null;
    
    const key = standariseAddress(event.keys[0]);
    if (key !== positionUpdatedKey) {
      return null;
    }
    
    const transactionHash = transaction.meta.hash;
    const contract = standariseAddress(event.fromAddress);
    
    // Check if this is a contract we're interested in
    const contractInfo = CONTRACTS.positionUpdated.contracts.find(
      (c: any) => c.address === contract
    );
    
    if (!contractInfo) {
      return null;
    }

    const processor = CONTRACTS.positionUpdated.processor;
    const positionData = processor(event.data);

    return {
      block_number: toNumber(toBigInt(blockNumber)),
      txIndex: toNumber(transaction.meta?.transactionIndex),
      eventIndex: toNumber(event.index),
      txHash: standariseAddress(transactionHash),
      locker: positionData.locker,
      token0: positionData.token0,
      token1: positionData.token1,
      fee: positionData.fee,
      tick_spacing: positionData.tick_spacing,
      extension: positionData.extension,
      salt: positionData.salt,
      lower_bound: positionData.lower_bound,
      upper_bound: positionData.upper_bound,
      liquidity_delta: positionData.liquidity_delta,
      amount0: positionData.amount0,
      amount1: positionData.amount1,
      timestamp: Math.round((new Date(timestamp)).getTime() / 1000),
    };
  }).filter(e => e !== null);
}