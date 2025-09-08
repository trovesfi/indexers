import { eventKey, standariseAddress, toBigInt, toNumber } from "../utils.ts";
import { isTLS } from "./constants.ts";

const positionUpdatedKey = standariseAddress(eventKey("PositionUpdated"));

function processPositionUpdated(_data: any[]) {
  const data = _data; // already contains both keys and data

  console.log(data, "_data");

  const lowerBoundVal = data[8];
  const lowerBoundValSign = standariseAddress(data[9]);
  const upperBoundVal = data[10];
  const upperBoundValSign = standariseAddress(data[11]);

  const lower_bound =
    lowerBoundValSign == "0x0"
      ? toBigInt(lowerBoundVal).toString()
      : (-toBigInt(lowerBoundVal)).toString();
  const upper_bound =
    upperBoundValSign == "0x0"
      ? toBigInt(upperBoundVal).toString()
      : (-toBigInt(upperBoundVal)).toString();

  const amount0Val = data[14];
  const amount0ValSign = standariseAddress(data[15]);
  const amount1Val = data[16];
  const amount1ValSign = standariseAddress(data[17]);

  const amount0 =
    amount0ValSign == "0x0"
      ? toBigInt(amount0Val).toString()
      : (-toBigInt(amount0Val)).toString();
  const amount1 =
    amount1ValSign == "0x0"
      ? toBigInt(amount1Val).toString()
      : (-toBigInt(amount1Val)).toString();

  const liquidityDelta = data[12];
  const liquidityDeltaSign = standariseAddress(data[13]);

  const liquidity_delta =
    liquidityDeltaSign == "0x0"
      ? toBigInt(liquidityDelta).toString()
      : (-toBigInt(liquidityDelta)).toString();

  console.log("heree");

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
          // "0x01f083b98674bc21effee29ef443a00c7b9a500fd92cf30341a3da12c73f2324"
        ),
        asset: "",
      },
    ],
    processor: processPositionUpdated,
  },
};

const filter: any = {
  events: [],
  header: { weak: false },
};

Object.keys(CONTRACTS).forEach((key: string) => {
  const info = CONTRACTS[key];
  info.contracts.forEach((c: any) => {
    filter.events.push({
      fromAddress: c.address,
      keys: [positionUpdatedKey],
      includeReceipt: false,
      includeReverted: false,
    });
  });
});

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

console.log(filter, "filter..");

export default function transform({ header, events }: any) {
  if (!header || !events) return [];

  const { blockNumber, timestamp } = header;

  console.log(
    `Processing block ${blockNumber} with ${events.length} events ----------------`
  );

  return events
    .map(({ event, transaction }: any) => {
      if (!transaction || !transaction.meta) return null;
      if (!event || !event.data || !event.keys) return null;

      const key = standariseAddress(event.keys[0]);
      console.log(key, "keyyyy---------");
      console.log(positionUpdatedKey, "positionUpdatedKey---------");
      if (key !== positionUpdatedKey) {
        console.log("returning null for unknown key--------");
        return null;
      }

      const transactionHash = transaction.meta.hash;

      console.log(transactionHash, "transactionHash---------");

      if (!event || !event.data || !event.keys) {
        console.error("position_updated: Expected event with data");
        return null;
      }

      const contract = standariseAddress(event.fromAddress);

      const contractInfo = CONTRACTS.positionUpdated.contracts.find(
        (c: any) => c.address === contract
      );

      console.log(contractInfo, "contractInfo---------");

      if (!contractInfo) {
        console.error(`Unknown contract: ${contract}`);
        return null;
      }

      try {
        const processor = CONTRACTS.positionUpdated.processor;

        console.log(processor, "processor---------");

        const positionData = processor(event.keys.concat(event.data));

        console.log(positionData, "positionData---------");

        console.log("Processing PositionUpdated event:", {
          blockNumber,
          transactionHash,
          contract,
          positionData,
        });

        return {
          block_number: toNumber(toBigInt(blockNumber)),
          txHash: standariseAddress(transactionHash),
          txIndex: toNumber(transaction.meta?.transactionIndex || 0),
          eventIndex: toNumber(event.index || 0),
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
          timestamp: Math.round(new Date(timestamp).getTime() / 1000),
        };
      } catch (error) {
        console.error("Error processing PositionUpdated event:", error, {
          blockNumber,
          transactionHash,
          contract,
          keys: event.keys,
          data: event.data,
        });
        return null;
      }
    })
    .filter((e) => e !== null);
}
