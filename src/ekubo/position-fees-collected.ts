import { eventKey, standariseAddress, toBigInt, toNumber } from "../utils.ts";
import { isTLS, CONTRACT_MAP } from "./constants.ts";

const positionFeesCollectedKey = standariseAddress(
  eventKey("PositionFeesCollected")
);

function processPositionFeesCollected(data: any[]) {
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

  const amount0Val = data[12];
  const amount0ValSign = standariseAddress(data[13]);
  const amount1Val = data[14];
  const amount1ValSign = standariseAddress(data[15]);

  const amount0 =
    amount0ValSign == "0x0"
      ? toBigInt(amount0Val).toString()
      : -toBigInt(amount0Val).toString();
  const amount1 =
    amount1ValSign == "0x0"
      ? toBigInt(amount1Val).toString()
      : -toBigInt(amount1Val).toString();

  return {
    token0: standariseAddress(data[1]),
    token1: standariseAddress(data[2]),
    fee: toBigInt(data[3]).toString(),
    tick_spacing: toBigInt(data[4]).toString(),
    extension: standariseAddress(data[5]),
    salt: toBigInt(data[6]).toString(),
    owner: standariseAddress(data[7]),
    lower_bound,
    upper_bound,
    amount0,
    amount1,
  };
}

const CONTRACTS: any = {
  positionFeesCollected: {
    contracts: [
      {
        address: standariseAddress(
          "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b"
        ),
        asset: "",
      },
      {
        address: standariseAddress(
          "0x01f083b98674bc21effee29ef443a00c7b9a500fd92cf30341a3da12c73f2324"
        ),
        asset: "",
      },
    ],
    processor: processPositionFeesCollected,
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
      keys: [positionFeesCollectedKey],
      includeReceipt: false,
      includeReverted: false,
    });
  });
});

export const config = {
  streamUrl: "https://mainnet.starknet.a5a.ch",
  startingBlock:
    typeof (globalThis as any).Deno !== "undefined"
      ? Number((globalThis as any).Deno.env.get("START_BLOCK") || 0)
      : 0,
  network: "starknet",
  finality: "DATA_STATUS_ACCEPTED",
  filter: filter,
  sinkType: "postgres",
  sinkOptions: {
    noTls: isTLS,
    tableName: "position_fees_collected",
  },
};

export default function transform({ header, events }: any) {
  if (!header || !events) return [];

  const { blockNumber, timestamp } = header;

  console.log(`Processing block ${blockNumber} with ${events.length} events`);

  return events
    .map(({ event, transaction }: any) => {
      if (!transaction || !transaction.meta) return null;
      if (!event || !event.data || !event.keys) return null;

      const key = standariseAddress(event.keys[0]);
      if (key !== positionFeesCollectedKey) {
        return null;
      }

      const transactionHash = transaction.meta.hash;

      if (!event || !event.data || !event.keys) {
        console.error("position_fees_collected: Expected event with data");
        return null;
      }

      const data = event.keys.concat(event.data);
      const contract = standariseAddress(event.fromAddress);

      const saltValue = toBigInt(data[6]).toString();
      const ownerValue = standariseAddress(data[7]);

      const contractInfo = CONTRACTS.positionFeesCollected.contracts.find(
        (c: any) => c.address === contract
      );

      if (!contractInfo) {
        console.error(`Unknown contract: ${contract}`);
        return null;
      }

      const allowedOwnerSalt = Object.values(CONTRACT_MAP).map(
        (i: any) => `${standariseAddress(i.owner)}:${i.salt}`
      );
      const currentOwnerSalt = `${ownerValue}:${saltValue}`;
      if (!allowedOwnerSalt.includes(currentOwnerSalt)) {
        console.log(
          `Not our owner/salt: ${currentOwnerSalt}, skipping this event...`
        );
        return null;
      }

      try {
        const processor = CONTRACTS.positionFeesCollected.processor;
        const feesData = processor(data);

        console.log("Processing PositionFeesCollected event:", {
          blockNumber,
          transactionHash,
          contract,
          feesData,
        });

        return {
          block_number: toNumber(toBigInt(blockNumber)),
          txHash: standariseAddress(transactionHash),
          txIndex: toNumber(transaction.meta?.transactionIndex || 0),
          eventIndex: toNumber(event.index || 0),
          token0: feesData.token0,
          token1: feesData.token1,
          fee: feesData.fee,
          tick_spacing: feesData.tick_spacing,
          extension: feesData.extension,
          salt: feesData.salt,
          owner: feesData.owner,
          lower_bound: feesData.lower_bound,
          upper_bound: feesData.upper_bound,
          amount0: feesData.amount0,
          amount1: feesData.amount1,
          timestamp: Math.round(new Date(timestamp).getTime() / 1000),
        };
      } catch (error) {
        console.error("Error processing PositionFeesCollected event:", error, {
          blockNumber,
          transactionHash,
          contract,
          keys: event.keys,
          data: event.data,
        });
        return null;
      }
    })
    .filter((e: any) => e !== null);
}
