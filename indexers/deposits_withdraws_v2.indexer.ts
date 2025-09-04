import "dotenv/config";

import { defineIndexer } from "@apibara/indexer";
import type {
  ExtractTablesWithRelations,
  TablesRelationalConfig,
} from "drizzle-orm";
import { StarknetStream } from "@apibara/starknet";
import { drizzleStorage } from "@apibara/plugin-drizzle";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ApibaraRuntimeConfig } from "apibara/types";
import { useLogger } from "@apibara/indexer/plugins";
import { and, eq } from "drizzle-orm";

import { standariseAddress, toBigInt, toNumber } from "../src/utils";
import { TOKENS } from "../src/strkfarm/constants";
import { getDB } from "./utils/index";
import * as schema from "./drizzle/schema";
import {
  UniversalStrategies,
  VesuRebalanceStrategies as VesuRebalanceStrategiesTroves,
} from "@strkfarm/sdk";

const depositKey =
  "0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2"; // "Deposit"
const withdrawKey =
  "0x17f87ab38a7f75a63dc465e10aadacecfca64c44ca774040b039bfb004e3367"; // "Withdraw"
const redeemKey =
  "0xfc5c8e7953c62fb357aebe6619c766f40a3e56113ec060b82286f715b6a7dc"; // RedeemRequested
const claimKey = standariseAddress(
  "0x0306482a50ea1a82bc2c1d79de5baf013f58ee2260881f6b6c60d31833ef220d"
); // RedeemClaimed
const erc4626Event =
  "0x20c620f0d41f84d5dcefe97ae96fb9becabb508b15b411d8f34aded3a984986"; // ERC4626Event

// const VesuRebalanceStrategies = VesuRebalanceStrategiesTroves.map((vesu) => ({
//   address: vesu.address,
//   name: vesu.name,
//   asset: vesu.depositTokens[0]!.address.address,
// }));
// const EvergreenVaults = UniversalStrategies.map((uni) => ({
//   address: uni.address.address,
//   name: uni.name,
//   asset: uni.depositTokens[0]!.address.address,
// }));

const VesuRebalanceStrategies = [
  {
    address:
      "0x7fb5bcb8525954a60fde4e8fb8220477696ce7117ef264775a1770e23571929",
    name: "Vesu Fusion STRK",
    asset: TOKENS.STRK,
  },
  {
    name: "Vesu Fusion ETH",
    address:
      "0x5eaf5ee75231cecf79921ff8ded4b5ffe96be718bcb3daf206690ad1a9ad0ca",
    asset: TOKENS.ETH,
  },
  {
    name: "Vesu Fusion USDC",
    address: "0xa858c97e9454f407d1bd7c57472fc8d8d8449a777c822b41d18e387816f29c",
    asset: TOKENS.USDC,
  },
  {
    name: "Vesu Fusion USDT",
    address:
      "0x115e94e722cfc4c77a2f15c4aefb0928c1c0029e5a57570df24c650cb7cec2c",
    asset: TOKENS.USDT,
  },
];

const EvergreenVaults = [
  {
    address:
      "0x7e6498cf6a1bfc7e6fc89f1831865e2dacb9756def4ec4b031a9138788a3b5e",
    name: "USDC Evergreen",
    asset: "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  },
  {
    address:
      "0x5a4c1651b913aa2ea7afd9024911603152a19058624c3e425405370d62bf80c",
    name: "WBTC Evergreen",
    asset: "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
  },
  {
    address: "0x446c22d4d3f5cb52b4950ba832ba1df99464c6673a37c092b1d9622650dbd8",
    name: "ETH Evergreen",
    asset: "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  },
  {
    address:
      "0x55d012f57e58c96e0a5c7ebbe55853989d01e6538b15a95e7178aca4af05c21",
    name: "STRK Evergreen",
    asset: "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  },
  {
    address: "0x1c4933d1880c6778585e597154eaca7b428579d72f3aae425ad2e4d26c6bb3",
    name: "USDT Evergreen",
    asset: "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  },
];

function dnmmProcessor(_data: any[]) {
  const key1 = standariseAddress(_data[0]);
  const type = key1 == standariseAddress(withdrawKey) ? "withdraw" : "deposit";
  const data = _data.slice(1);

  if (type == "deposit") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[1]),
      amount: toBigInt(data[2]).toString(),
      type: "deposit",
    };
  } else if (type == "withdraw") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[2]),
      amount: toBigInt(data[3]).toString(),
      type: "withdraw",
    };
  } else {
    console.error(`Unknown type: ${type}`);
    throw new Error("strkfarm:deposit_withdraw:dnmm: unknown action type");
  }
}

function erc4626Processor(_data: any[]) {
  const type =
    standariseAddress(_data[0]) == standariseAddress(depositKey)
      ? "deposit"
      : "withdraw";
  const data = _data.slice(1);
  if (type == "deposit") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[1]),
      amount: toBigInt(data[2]).toString(),
      type: "deposit",
    };
  } else if (type == "withdraw") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[2]),
      amount: toBigInt(data[3]).toString(),
      type: "withdraw",
    };
  } else {
    console.error(`Unknown type: ${type}`);
    throw new Error("strkfarm:deposit_withdraw:erc4626: unknown action type");
  }
}

function starknetVaultKitProcessor(_data: any[]) {
  const key1 = standariseAddress(_data[0]);
  let type = "deposit";
  let data = _data.slice(1);
  if (key1 == erc4626Event) {
    data = _data.slice(2); // first 2 keys are removed
    const key2 = standariseAddress(_data[1]);
    if (key2 == depositKey) {
      type = "deposit";
    } else {
      throw new Error(
        "strkfarm:deposit_withdraw:starknet_vault_kit: unknown action type"
      );
    }
  } else if (key1 == redeemKey) {
    type = "redeem";
  } else if (key1 == claimKey) {
    type = "claim";
  } else {
    throw new Error(
      "strkfarm:deposit_withdraw:starknet_vault_kit: unknown action type"
    );
  }
  if (type == "deposit") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[1]),
      amount: toBigInt(data[2]).toString(),
      request_id: "0", // not applicable for deposits
      epoch: 0, // not applicable for deposits
      type: "deposit",
    };
  } else if (type == "redeem") {
    /// Event emitted when a user requests a redemption
    // #[derive(Drop, starknet::Event)]
    // pub struct RedeemRequested {
    //     pub owner: ContractAddress, // Share owner requesting redemption
    //     pub receiver: ContractAddress, // Address to receive the redemption NFT
    //     pub shares: u256, // Original shares requested for redemption
    //     pub assets: u256, // Assets allocated after fees
    //     pub id: u256, // NFT ID for the redemption request
    //     pub epoch: u256 // Epoch when redemption was requested
    // }
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[0]),
      amount: toBigInt(data[4]).toString(),
      request_id: toBigInt(data[6]).toString(), // not applicable for deposits
      epoch: toBigInt(data[8]).toString(),
      type: "redeem",
    };
  } else if (type == "claim") {
    // /// Event emitted when a redemption is claimed
    // #[derive(Drop, starknet::Event)]
    // pub struct RedeemClaimed {
    //     pub receiver: ContractAddress, // Address receiving the assets
    //     pub redeem_request_nominal: u256, // Original shares amount
    //     pub assets: u256, // Actual assets received (may be less due to losses)
    //     pub id: u256, // NFT ID that was burned
    //     pub epoch: u256 // Epoch when redemption was originally requested
    // }
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[0]), // just dummy
      owner: standariseAddress(data[0]), // just dummy
      amount: toBigInt(data[3]).toString(),
      request_id: toBigInt(data[5]).toString(), // not applicable for deposits
      epoch: toBigInt(data[7]).toString(),
      type: "claim",
    };
  } else {
    console.error(`Unknown type: ${type}`);
    throw new Error("strkfarm:deposit_withdraw:erc4626: unknown action type");
  }
}

const CONTRACTS = {
  dnmm: {
    contracts: [
      {
        address: standariseAddress(
          "0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b"
        ),
        asset: TOKENS.STRK,
      },
    ],
    processor: dnmmProcessor,
  },
  erc4626: {
    contracts: [
      {
        address: standariseAddress(
          "0x016912b22d5696e95ffde888ede4bd69fbbc60c5f873082857a47c543172694f"
        ),
        asset: TOKENS.USDC,
      },
      {
        address: standariseAddress(
          "0x541681b9ad63dff1b35f79c78d8477f64857de29a27902f7298f7b620838ea"
        ),
        asset: TOKENS.STRK,
      },
      ...VesuRebalanceStrategies.map((s) => {
        return {
          address: standariseAddress(s.address),
          asset: s.asset,
        };
      }),
    ],
    processor: erc4626Processor,
  },
  starknetVaultKit: {
    contracts: [
      ...EvergreenVaults.map((s) => {
        return {
          address: standariseAddress(s.address),
          asset: s.asset,
        };
      }),
    ],
    keys: [[erc4626Event, depositKey], [redeemKey], [claimKey]],
    processor: starknetVaultKitProcessor,
  },
  ekubo: {
    contracts: [
      {
        address: standariseAddress(
          "0x01f083b98674bc21effee29ef443a00c7b9a500fd92cf30341a3da12c73f2324"
        ),
        asset: "",
      },
      {
        address: standariseAddress(
          "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b"
        ),
        asset: "",
      },
    ],
  },
};

// Initiate a filter builder
const DEFAULT_KEYS = [depositKey, withdrawKey];
const ALL_KEYS = [depositKey, withdrawKey, redeemKey, claimKey, erc4626Event];

const filter: {
  header: "on_data";
  events: {
    address: `0x${string}`;
    keys: `0x${string}`[];
    includeReceipt: boolean;
  }[];
} = {
  events: [],
  header: "on_data",
};

Object.keys(CONTRACTS).map((key) => {
  const info = CONTRACTS[key];
  info.contracts.forEach((c: any) => {
    if (info.keys) {
      info.keys.forEach((k: `0x${string}`[]) => {
        filter.events.push({
          address: c.address,
          keys: k, // omits start to keys to check
          includeReceipt: false,
        });
      });
    } else {
      DEFAULT_KEYS.forEach((k: string) => {
        filter.events.push({
          address: c.address,
          keys: [k as `0x${string}`],
          includeReceipt: false,
        });
      });
    }
  });
});

export default function (runtimeConfig: ApibaraRuntimeConfig) {
  return createIndexer({
    database: getDB(process.env.POSTGRES_CONNECTION_STRING!),
    config: runtimeConfig,
  });
}

export function createIndexer<
  TQueryResult extends PgQueryResultHKT,
  TFullSchema extends Record<string, unknown> = Record<string, never>,
  TSchema extends
    TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
>({
  database,
  config,
}: {
  database: PgDatabase<TQueryResult, TFullSchema, TSchema>;
  config: ApibaraRuntimeConfig;
}) {
  return defineIndexer(StarknetStream)({
    streamUrl: process.env.STREAM_URL!,
    startingBlock: BigInt(process.env.START_BLOCK!),
    plugins: [
      // @ts-ignore
      drizzleStorage({
        db: database,
        idColumn: "event_id",
        persistState: true,
        indexerName: "deposits_withdraws_v2",
      }),
    ],
    finality: "accepted",
    filter: {
      header: "on_data",
      events: filter.events,
    },
    // @ts-ignore
    async transform({ block }) {
      const { events, header } = block;

      if (!events || !header) return;
      if (!header.blockNumber) {
        throw new Error(`Expected block with blockNumber`);
      }

      const blockNumber = header.blockNumber;

      const logger = useLogger();
      logger.info("Processing block:", block.header.blockNumber);

      for (let event of block.events) {
        if (!event || !event.data || !event.keys) return;

        const key = standariseAddress(event.keys[0]);

        if (!ALL_KEYS.includes(key)) return null;

        const transactionHash = event.transactionHash;

        if (!event || !event.data || !event.keys) {
          console.error("dstrkfarm:deposit_withdraw:Expected event with data");
          throw new Error("strkfarm:deposit_withdraw:Expected event with data");
        }

        const contract = standariseAddress(event.address);

        const contractInfo = Object.keys(CONTRACTS)
          .map((key: string) => {
            if (
              CONTRACTS[key].contracts
                .map((c: any) => standariseAddress(c.address))
                .includes(contract)
            ) {
              return CONTRACTS[key];
            }
          })
          .filter((e) => e != null)[0];

        if (!contractInfo) {
          console.error(`Unknown contract: ${contract}`);
          throw new Error("strkfarm:deposit_withdraw:Unknown contract");
        }

        const asset = contractInfo.contracts.filter(
          (c: any) => c.address == contract
        )[0].asset;
        const processor = contractInfo.processor;

        const info = {
          ...processor(event.keys.concat(event.data)),
          asset,
          contract,
        };

        const record: any = {
          block_number: toNumber(toBigInt(blockNumber)),
          txHash: standariseAddress(transactionHash),
          txIndex: toNumber(event.transactionIndex),
          eventIndex: toNumber(event.eventIndex),
          epoch: toNumber(0), // default
          request_id: toNumber(0), // default
          ...info,
          timestamp: Math.round(new Date(header.timestamp).getTime() / 1000),
        };

        try {
          const existing = await database
            .selectDistinct()
            .from(schema["investment_flows"])
            .where(
              and(
                eq(
                  schema["investment_flows"].block_number,
                  record.block_number
                ),
                eq(schema["investment_flows"].txHash, record.transaction_hash),
                eq(schema["investment_flows"].eventIndex, record.event_index)
              )
            )
            .limit(1);

          if (existing.length) {
            console.log(`Record already exists, updating...`);
            await database
              .update(schema["investment_flows"])
              .set(record)
              .where(
                and(
                  eq(
                    schema["investment_flows"].block_number,
                    record.block_number
                  ),
                  eq(
                    schema["investment_flows"].txHash,
                    record.transaction_hash
                  ),
                  eq(schema["investment_flows"].eventIndex, record.event_index)
                )
              )
              .execute();
            console.log(`Updated existing record`);
          } else {
            await database
              .insert(schema["investment_flows"])
              .values(record)
              .execute();
          }
        } catch (err) {
          console.log(`record`, record);
          console.log(`config`, config);
        }
      }
    },
  });
}
