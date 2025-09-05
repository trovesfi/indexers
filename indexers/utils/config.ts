import "dotenv/config";

import { standariseAddress } from "../../src/utils";
import { TOKENS } from "../../src/strkfarm/constants";
import { eventKey } from "./common_transform";
import { hash } from "starknet";

export interface EventField {
  name: string;
  type: string;
  sqlType: string;
}

export interface AdditionalField {
  name: string;
  source: "transaction" | "block" | "event" | "custom";
  path?: string;
  sqlType: string;
  customLogic?: (
    event: any,
    transaction: any,
    header: any,
    contractInfo?: any
  ) => any;
}

export interface ContractConfig {
  address: string;
  asset: string;
  name?: string;
}

export interface EventConfig {
  tableName: string;
  eventName: string;
  contracts: ContractConfig[];
  keys?: `0x${string}`[][]; // custom key combinations
  defaultKeys?: `0x${string}`[]; // default keys if keys not specified
  keyFields: EventField[];
  dataFields: EventField[];
  additionalFields: AdditionalField[];
  processor: string; // processor name
}

export const depositKey = eventKey("Deposit");
export const withdrawKey = eventKey("Withdraw");
export const redeemKey = eventKey("RedeemRequested");
export const claimKey = standariseAddress(
  "0x0306482a50ea1a82bc2c1d79de5baf013f58ee2260881f6b6c60d31833ef220d"
);
const erc4626Event = eventKey("ERC4626Event");

const VesuRebalanceStrategies = [
  {
    address: standariseAddress(
      "0x7fb5bcb8525954a60fde4e8fb8220477696ce7117ef264775a1770e23571929"
    ),
    name: "Vesu Fusion STRK",
    asset: TOKENS.STRK,
  },
  {
    name: "Vesu Fusion ETH",
    address: standariseAddress(
      "0x5eaf5ee75231cecf79921ff8ded4b5ffe96be718bcb3daf206690ad1a9ad0ca"
    ),
    asset: TOKENS.ETH,
  },
  {
    name: "Vesu Fusion USDC",
    address: standariseAddress(
      "0xa858c97e9454f407d1bd7c57472fc8d8d8449a777c822b41d18e387816f29c"
    ),
    asset: TOKENS.USDC,
  },
  {
    name: "Vesu Fusion USDT",
    address: standariseAddress(
      "0x115e94e722cfc4c77a2f15c4aefb0928c1c0029e5a57570df24c650cb7cec2c"
    ),
    asset: TOKENS.USDT,
  },
];

const EvergreenVaults = [
  {
    address: standariseAddress(
      "0x7e6498cf6a1bfc7e6fc89f1831865e2dacb9756def4ec4b031a9138788a3b5e"
    ),
    name: "USDC Evergreen",
    asset: "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  },
  {
    address: standariseAddress(
      "0x5a4c1651b913aa2ea7afd9024911603152a19058624c3e425405370d62bf80c"
    ),
    name: "WBTC Evergreen",
    asset: "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
  },
  {
    address: standariseAddress(
      "0x446c22d4d3f5cb52b4950ba832ba1df99464c6673a37c092b1d9622650dbd8"
    ),
    name: "ETH Evergreen",
    asset: "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  },
  {
    address: standariseAddress(
      "0x55d012f57e58c96e0a5c7ebbe55853989d01e6538b15a95e7178aca4af05c21"
    ),
    name: "STRK Evergreen",
    asset: "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  },
  {
    address: standariseAddress(
      "0x1c4933d1880c6778585e597154eaca7b428579d72f3aae425ad2e4d26c6bb3"
    ),
    name: "USDT Evergreen",
    asset: "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  },
];

export const CONFIG: Record<string, EventConfig> = {
  dnmm: {
    tableName: "investment_flows",
    eventName: "DnmmEvent",
    contracts: [
      {
        address: standariseAddress(
          "0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b"
        ),
        asset: TOKENS.STRK,
      },
    ],
    defaultKeys: [depositKey, withdrawKey],
    keyFields: [{ name: "event_type", type: "felt252", sqlType: "text" }],
    dataFields: [
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "receiver", type: "ContractAddress", sqlType: "text" },
      { name: "owner", type: "ContractAddress", sqlType: "text" },
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "type",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          const key1 = standariseAddress(event.keys[0]);
          return key1 == standariseAddress(withdrawKey)
            ? "withdraw"
            : "deposit";
        },
      },
      {
        name: "asset",
        source: "custom",
        sqlType: "text",
        customLogic: () => TOKENS.STRK,
      },
      {
        name: "contract",
        source: "event",
        path: "address",
        sqlType: "text",
      },
      {
        name: "epoch",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: () => "0",
      },
      {
        name: "request_id",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: () => "0",
      },
    ],
    processor: "dnmm",
  },

  erc4626: {
    tableName: "investment_flows",
    eventName: "Erc4626Event",
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
      ...VesuRebalanceStrategies.map((s) => ({
        address: standariseAddress(s.address),
        asset: s.asset,
        name: s.name,
      })),
    ],
    defaultKeys: [depositKey, withdrawKey],
    keyFields: [{ name: "event_type", type: "felt252", sqlType: "text" }],
    dataFields: [
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "receiver", type: "ContractAddress", sqlType: "text" },
      { name: "owner", type: "ContractAddress", sqlType: "text" },
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "type",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          const key1 = standariseAddress(event.keys[0]);
          return key1 == standariseAddress(depositKey) ? "deposit" : "withdraw";
        },
      },
      {
        name: "asset",
        source: "custom",
        sqlType: "text",
        customLogic: (event, transaction, header) => {
          // this will be handled in the transform function
          return ""; // placeholder, will be set in transform
        },
      },
      {
        name: "contract",
        source: "event",
        path: "address",
        sqlType: "text",
      },
      {
        name: "epoch",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: () => "0",
      },
      {
        name: "request_id",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: () => "0",
      },
    ],
    processor: "erc4626",
  },

  // starknetVaultKit: {
  //   tableName: "investment_flows",
  //   eventName: "StarknetVaultKitEvent",
  //   contracts: EvergreenVaults.map((s) => ({
  //     address: standariseAddress(s.address),
  //     asset: s.asset,
  //     name: s.name,
  //   })),
  //   keys: [
  //     [erc4626Event, depositKey],
  //     [redeemKey],
  //     [claimKey as `0x${string}`],
  //   ],
  //   keyFields: [
  //     { name: "event_type", type: "felt252", sqlType: "text" },
  //     { name: "sub_event_type", type: "felt252", sqlType: "text" },
  //   ],
  //   dataFields: [
  //     { name: "field1", type: "ContractAddress", sqlType: "text" },
  //     { name: "field2", type: "ContractAddress", sqlType: "text" },
  //     { name: "field3", type: "u256", sqlType: "numeric(78,0)" },
  //   ],
  //   additionalFields: [
  //     {
  //       name: "sender",
  //       source: "custom",
  //       sqlType: "text",
  //       customLogic: (event) => {
  //         const key1 = standariseAddress(event.keys[0]);
  //         let data = event.data;
  //         let dataOffset = 0;

  //         if (key1 == erc4626Event) {
  //           dataOffset = 0; // ERC4626Event with deposit
  //           return standariseAddress(data[dataOffset]);
  //         } else if (key1 == redeemKey) {
  //           return standariseAddress(data[0]);
  //         } else if (key1 == claimKey) {
  //           return standariseAddress(data[0]);
  //         }
  //         return "";
  //       },
  //     },
  //     {
  //       name: "receiver",
  //       source: "custom",
  //       sqlType: "text",
  //       customLogic: (event) => {
  //         const key1 = standariseAddress(event.keys[0]);
  //         let data = event.data;

  //         if (key1 == erc4626Event) {
  //           return standariseAddress(data[1]);
  //         } else if (key1 == redeemKey) {
  //           return standariseAddress(data[1]);
  //         } else if (key1 == claimKey) {
  //           return standariseAddress(data[0]); // dummy
  //         }
  //         return "";
  //       },
  //     },
  //     {
  //       name: "owner",
  //       source: "custom",
  //       sqlType: "text",
  //       customLogic: (event) => {
  //         const key1 = standariseAddress(event.keys[0]);
  //         let data = event.data;

  //         if (key1 == erc4626Event) {
  //           return standariseAddress(data[1]);
  //         } else if (key1 == redeemKey) {
  //           return standariseAddress(data[0]);
  //         } else if (key1 == claimKey) {
  //           return standariseAddress(data[0]); // dummy
  //         }
  //         return "";
  //       },
  //     },
  //     {
  //       name: "amount",
  //       source: "custom",
  //       sqlType: "numeric(78,0)",
  //       customLogic: (event) => {
  //         const key1 = standariseAddress(event.keys[0]);
  //         let data = event.data;

  //         if (key1 == erc4626Event) {
  //           return BigInt(data[2]).toString();
  //         } else if (key1 == redeemKey) {
  //           return BigInt(data[4]).toString();
  //         } else if (key1 == claimKey) {
  //           return BigInt(data[3]).toString();
  //         }
  //         return "0";
  //       },
  //     },
  //     {
  //       name: "request_id",
  //       source: "custom",
  //       sqlType: "numeric(20,0)",
  //       customLogic: (event) => {
  //         const key1 = standariseAddress(event.keys[0]);
  //         let data = event.data;

  //         if (key1 == erc4626Event) {
  //           return "0"; // not applicable for deposits
  //         } else if (key1 == redeemKey) {
  //           return BigInt(data[6]).toString();
  //         } else if (key1 == claimKey) {
  //           return BigInt(data[5]).toString();
  //         }
  //         return "0";
  //       },
  //     },
  //     {
  //       name: "epoch",
  //       source: "custom",
  //       sqlType: "numeric(20,0)",
  //       customLogic: (event) => {
  //         const key1 = standariseAddress(event.keys[0]);
  //         let data = event.data;

  //         if (key1 == erc4626Event) {
  //           return "0"; // not applicable for deposits
  //         } else if (key1 == redeemKey) {
  //           return BigInt(data[8]).toString();
  //         } else if (key1 == claimKey) {
  //           return BigInt(data[7]).toString();
  //         }
  //         return "0";
  //       },
  //     },
  //     {
  //       name: "type",
  //       source: "custom",
  //       sqlType: "text",
  //       customLogic: (event) => {
  //         const key1 = standariseAddress(event.keys[0]);

  //         if (key1 == erc4626Event) {
  //           const key2 = standariseAddress(event.keys[1]);
  //           if (key2 == depositKey) {
  //             return "deposit";
  //           } else {
  //             throw new Error(
  //               "strkfarm:deposit_withdraw:starknet_vault_kit: unknown action type"
  //             );
  //           }
  //         } else if (key1 == redeemKey) {
  //           return "redeem";
  //         } else if (key1 == claimKey) {
  //           return "claim";
  //         } else {
  //           throw new Error(
  //             "strkfarm:deposit_withdraw:starknet_vault_kit: unknown action type"
  //           );
  //         }
  //       },
  //     },
  //     {
  //       name: "asset",
  //       source: "custom",
  //       sqlType: "text",
  //       customLogic: (event, transaction, header, contractInfo) => {
  //         const contract = standariseAddress(event.address);
  //         const contractConfig = contractInfo.contracts.find(
  //           (c: any) => c.address == contract
  //         );
  //         return contractConfig?.asset || "";
  //       },
  //     },
  //     {
  //       name: "contract",
  //       source: "event",
  //       path: "address",
  //       sqlType: "text",
  //     },
  //   ],
  //   processor: "starknetVaultKit",
  // },

  ekubo: {
    tableName: "investment_flows",
    eventName: "EkuboEvent",
    contracts: [
      {
        address: standariseAddress(
          "0x01f083b98674bc21effee29ef443a00c7b9a500fd92cf30341a3da12c73f2324"
        ),
        asset: "",
      },
    ],
    defaultKeys: [depositKey, withdrawKey],
    keyFields: [{ name: "event_type", type: "felt252", sqlType: "text" }],
    dataFields: [
      { name: "field1", type: "felt252", sqlType: "text" },
      { name: "field2", type: "felt252", sqlType: "text" },
      { name: "field3", type: "felt252", sqlType: "text" },
    ],
    additionalFields: [
      {
        name: "sender",
        source: "custom",
        sqlType: "text",
        customLogic: () => "",
      },
      {
        name: "receiver",
        source: "custom",
        sqlType: "text",
        customLogic: () => "",
      },
      {
        name: "owner",
        source: "custom",
        sqlType: "text",
        customLogic: () => "",
      },
      {
        name: "amount",
        source: "custom",
        sqlType: "numeric(78,0)",
        customLogic: () => "0",
      },
      {
        name: "asset",
        source: "custom",
        sqlType: "text",
        customLogic: () => "",
      },
      {
        name: "contract",
        source: "event",
        path: "address",
        sqlType: "text",
      },
      {
        name: "type",
        source: "custom",
        sqlType: "text",
        customLogic: () => "ekubo",
      },
      {
        name: "epoch",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: () => "0",
      },
      {
        name: "request_id",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: () => "0",
      },
    ],
    processor: "ekubo",
  },

  positionFee: {
    tableName: "position_fees_collected",
    eventName: "PositionFeesCollected",
    contracts: [
      {
        address: standariseAddress(
          "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b"
        ),
        asset: "",
      },
    ],
    defaultKeys: [eventKey('PositionFeesCollected')],
    keyFields: [{ name: "event_type", type: "felt252", sqlType: "text" }],
    dataFields: [
      { name: "pool_key", type: "PoolKey", sqlType: "text" },
      { name: "position_key", type: "PositionKey", sqlType: "text" },
      { name: "delta", type: "Delta", sqlType: "text" },
    ],
    additionalFields: [],
    processor: "processPositionFeesCollected",
  },

  positionUpdated: {
    tableName: "position_updated",
    eventName: "PositionUpdated",
    contracts: [
      {
        address: standariseAddress(
          "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b"
        ),
        asset: "",
      },
    ],
    defaultKeys: [eventKey('PositionUpdated')],
    keyFields: [{ name: "event_type", type: "felt252", sqlType: "text" }],
    dataFields: [
      { name: "locker", type: "ContractAddress", sqlType: "text" },
      { name: "pool_key", type: "PoolKey", sqlType: "text" },
      { name: "params", type: "UpdatePositionParameters", sqlType: "text" },
      { name: "delta", type: "Delta", sqlType: "text" },
    ],
    additionalFields: [],
    processor: "processPositionUpdated",
  },
};
