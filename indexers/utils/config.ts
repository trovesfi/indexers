import "dotenv/config";

import { standariseAddress } from "../../src/utils";
import { TOKENS } from "../../src/strkfarm/constants";
import { eventKey } from "./common_transform";
import { hash } from "starknet";
import { Block, Event, TransactionReceipt } from "@apibara/starknet";
import { onEventEkuboVault } from "./ekubo_vault";
import { onEventDnmmVault } from "./dnmm_vault";
import { onEventHarvestsVault } from "./harvests_vault";

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

export type OnEvent = (event: Event, processedRecord: Record<string, any>, allEvents: readonly Event[], block: Block) => Promise<void>;
export interface EventConfig {
  tableName: string;
  eventName: string;
  contracts: ContractConfig[];
  keys?: `0x${string}`[][]; // custom key combinations
  defaultKeys: `0x${string}`[][]; // default keys if keys not specified
  keyFields: EventField[];
  dataFields: EventField[];
  additionalFields: AdditionalField[];
  includeReceipt?: boolean;
  onEvent?: OnEvent;
}

// export const depositKey = eventKey("Deposit");
// export const withdrawKey = eventKey("Withdraw");
// export const redeemKey = eventKey("RedeemRequested");
// export const claimKey = standariseAddress(
//   "0x0306482a50ea1a82bc2c1d79de5baf013f58ee2260881f6b6c60d31833ef220d"
// );

const EKUBO_VAULT_CONTRACTS: ContractConfig[] = [
  {
    address: standariseAddress(
      "0x01f083b98674bc21effee29ef443a00c7b9a500fd92cf30341a3da12c73f2324"
    ),
    asset: "",
    name: 'xSTRK/STRK'
  },
  {
    address: standariseAddress(
      "0x3a4f8debaf12af97bb911099bc011d63d6c208d4c5ba8e15d7f437785b0aaa2"
    ),
    asset: "",
    name: 'USDC/USDT'
  },
  {
    address: standariseAddress(
      "0x160d8fa4569ef6a12e6bf47cb943d7b5ebba8a41a69a14c1d943050ba5ff947"
    ),
    asset: "",
    name: 'ETH/USDC'
  },
  {
    address: standariseAddress(
      "0x351b36d0d9d8b40010658825adeeddb1397436cd41acd0ff6c6e23aaa8b5b30"
    ),
    asset: "",
    name: 'STRK/USDC'
  },
  {
    address: standariseAddress(
      "0x4ce3024b0ee879009112d7b0e073f8a87153dd35b029347d4247ffe48d28f51"
    ),
    asset: "",
    name: 'STRK/ETH'
  },
  {
    address: standariseAddress(
      "0x2bcaef2eb7706875a5fdc6853dd961a0590f850bc3a031c59887189b5e84ba1"
    ),
    asset: "",
    name: 'WBTC/USDC'
  },
  {
    address: standariseAddress(
      "0x4aad891a2d4432fba06b6558631bb13f6bbd7f6f33ab8c3111e344889ea4456"
    ),
    asset: "",
    name: 'tBTC/USDC'
  },
  {
    address: standariseAddress(
      "0x1c9232b8186d9317652f05055615f18a120c2ad9e5ee96c39e031c257fb945b"
    ),
    asset: "",
    name: 'ETH/WBTC'
  },
  {
    address: standariseAddress(
      "0x1248e385c23a929a015ec298a26560fa7745bbd6e41a886550e337b02714b1b"
    ),
    asset: "",
    name: 'WBTC/STRK'
  },
]

const DNMM_CONTRACTS: ContractConfig[] = [
  {
    address: standariseAddress(
      "0x04937b58e05a3a2477402d1f74e66686f58a61a5070fcc6f694fb9a0b3bae422"
    ),
    asset: TOKENS.USDC,
    name: 'DNMM USDC'
  },
  {
    address: standariseAddress(
      "0x020d5fc4c9df4f943ebb36078e703369c04176ed00accf290e8295b659d2cea6"
    ),
    asset: TOKENS.STRK,
    name: 'DNMM STRK'
  },
  {
    address: standariseAddress(
      "0x9d23d9b1fa0db8c9d75a1df924c3820e594fc4ab1475695889286f3f6df250"
    ),
    asset: TOKENS.ETH,
    name: 'DNMM ETH'
  },
  {
    address: standariseAddress(
      "0x9140757f8fb5748379be582be39d6daf704cc3a0408882c0d57981a885eed9"
    ),
    asset: TOKENS.ETH,
    name: 'DNMM ETH 2'
  },
  {
    address: standariseAddress(
      "0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b"
    ),
    asset: TOKENS.STRK,
    name: 'DNMM STRK 2'
  }
]

const HARVEST_CONTRACTS: ContractConfig[] = [
  {
    address: standariseAddress(
      "0x0387f3eb1d98632fbe3440a9f1385Aec9d87b6172491d3Dd81f1c35A7c61048F"
    ),
    asset: "",
    name: 'Vesu Harvest'
  },
  {
    address: standariseAddress(
      "0x7fb5bcb8525954a60fde4e8fb8220477696ce7117ef264775a1770e23571929"
    ),
    asset: TOKENS.STRK,
    name: 'Vesu Fusion STRK'
  },
  {
    address: standariseAddress(
      "0x5eaf5ee75231cecf79921ff8ded4b5ffe96be718bcb3daf206690ad1a9ad0ca"
    ),
    asset: TOKENS.ETH,
    name: 'Vesu Fusion ETH'
  },
  {
    address: standariseAddress(
      "0xa858c97e9454f407d1bd7c57472fc8d8d8449a777c822b41d18e387816f29c"
    ),
    asset: TOKENS.USDC,
    name: 'Vesu Fusion USDC'
  },
  {
    address: standariseAddress(
      "0x115e94e722cfc4c77a2f15c4aefb0928c1c0029e5a57570df24c650cb7cec2c"
    ),
    asset: TOKENS.USDT,
    name: 'Vesu Fusion USDT'
  },
  {
    address: standariseAddress(
      "0x1f083b98674bc21effee29ef443a00c7b9a500fd92cf30341a3da12c73f2324"
    ),
    asset: TOKENS.STRK,
    name: 'Ekubo xSTRK/STRK'
  }
]

export const CONFIG: EventConfig[] = [
  {
    tableName: "investment_flows",
    eventName: "Deposit",
    includeReceipt: true,
    contracts: EKUBO_VAULT_CONTRACTS,
    onEvent: onEventEkuboVault,
    defaultKeys: [[eventKey("Deposit")]],
    keyFields: [
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "owner", type: "ContractAddress", sqlType: "text" },
    ],
    dataFields: [
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
      { name: "shares", type: "u256", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "receiver",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          return standariseAddress(event.keys[1]); // same as owner
        },
      },
      {
        name: "asset",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          // not applicable for this vault
          return ""
        },
      },
      {
        name: "contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          return standariseAddress(event.address);
        },
      },
      {
        name: "epoch",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: () => 0,
      },
      {
        name: "request_id",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: (event) => {
          return 0
        },
      },
      {
        name: "type",
        source: "custom",
        sqlType: "text",
        customLogic: () => "deposit",
      },
    ],
  },
  {
    tableName: "investment_flows",
    eventName: "Withdraw",
    includeReceipt: true,
    contracts: EKUBO_VAULT_CONTRACTS,
    onEvent: onEventEkuboVault,
    defaultKeys: [[eventKey("Withdraw")]],
    keyFields: [
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "receiver", type: "ContractAddress", sqlType: "text" },
      { name: "owner", type: "ContractAddress", sqlType: "text" },
    ],
    dataFields: [
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
      { name: "shares", type: "u256", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "asset",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          // not applicable for this vault
          return ""
        },
      },
      {
        name: "contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          return standariseAddress(event.address);
        },
      },
      {
        name: "epoch",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: () => 0,
      },
      {
        name: "request_id",
        source: "custom",
        sqlType: "numeric(20,0)",
        customLogic: (event) => {
          return 0
        },
      },
      {
        name: "type",
        source: "custom",
        sqlType: "text",
        customLogic: () => "withdraw",
      },
    ],
  },
  {
    tableName: "position_fees_collected",
    eventName: "HandleFees",
    contracts: EKUBO_VAULT_CONTRACTS,
    defaultKeys: [[eventKey('HandleFees')]],
    keyFields: [],
    dataFields: [
      { name: "token0", type: "ContractAddress", sqlType: "text" },
      { name: "token0_origin_bal", type: "u256", sqlType: "skip" },
      { name: "amount0", type: "u256", sqlType: "numeric(78,0)" },
      { name: "token1", type: "ContractAddress", sqlType: "text" },
      { name: "token1_origin_bal", type: "u256", sqlType: "skip" },
      { name: "amount1", type: "u256", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "vault_address",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          return standariseAddress(event.address);
        },
      }
    ],
  },
  {
    tableName: "dnmm_user_actions",
    eventName: "Deposit",
    contracts: DNMM_CONTRACTS,
    onEvent: onEventDnmmVault,
    defaultKeys: [["0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2"]], // Deposit key
    keyFields: [
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "receiver", type: "ContractAddress", sqlType: "text" },
    ],
    dataFields: [
      { name: "assets", type: "ContractAddress", sqlType: "text" },
      { name: "position_acc1_supply_shares", type: "u256", sqlType: "numeric(78,0)" },
      { name: "position_acc1_borrow_shares", type: "u256", sqlType: "numeric(78,0)" },
      { name: "position_acc2_supply_shares", type: "u256", sqlType: "numeric(78,0)" },
      { name: "position_acc2_borrow_shares", type: "u256", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "owner",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          return standariseAddress(event.keys[2]); // same as receiver for deposits
        },
      },
      {
        name: "contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          return standariseAddress(event.address);
        },
      },
      {
        name: "type",
        source: "custom",
        sqlType: "text",
        customLogic: () => "deposit",
      },
    ],
  },
  {
    tableName: "dnmm_user_actions",
    eventName: "Withdraw",
    contracts: DNMM_CONTRACTS,
    onEvent: onEventDnmmVault,
    defaultKeys: [["0x17f87ab38a7f75a63dc465e10aadacecfca64c44ca774040b039bfb004e3367"]], // Withdraw key
    keyFields: [
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "receiver", type: "ContractAddress", sqlType: "text" },
      { name: "owner", type: "ContractAddress", sqlType: "text" },
    ],
    dataFields: [
      { name: "assets", type: "ContractAddress", sqlType: "text" },
      { name: "position_acc1_supply_shares", type: "u256", sqlType: "numeric(78,0)" },
      { name: "position_acc1_borrow_shares", type: "u256", sqlType: "numeric(78,0)" },
      { name: "position_acc2_supply_shares", type: "u256", sqlType: "numeric(78,0)" },
      { name: "position_acc2_borrow_shares", type: "u256", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          return standariseAddress(event.address);
        },
      },
      {
        name: "type",
        source: "custom",
        sqlType: "text",
        customLogic: () => "withdraw",
      },
    ],
  },
  {
    tableName: "harvests",
    eventName: "Claimed",
    includeReceipt: true,
    contracts: HARVEST_CONTRACTS,
    onEvent: onEventHarvestsVault,
    defaultKeys: [["0x35cc0235f835cc84da50813dc84eb10a75e24a21d74d6d86278c0f037cb7429"]], // Claimed key
    keyFields: [
      { name: "claimee", type: "ContractAddress", sqlType: "text" },
    ],
    dataFields: [
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "user",
        source: "custom",
        sqlType: "text",
        customLogic: () => "", // Will be set in onEvent
      },
      {
        name: "contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          return standariseAddress(event.keys[1]); // claimee
        },
      },
      {
        name: "price",
        source: "custom",
        sqlType: "numeric(5,2)",
        customLogic: () => 0,
      },
    ],
  },
  {
    tableName: "harvests",
    eventName: "Harvest",
    contracts: HARVEST_CONTRACTS,
    onEvent: onEventHarvestsVault,
    defaultKeys: [["0x7bfb812ef65292405e9c4e05f2befe48dae3e62d7ed27bada75d2384e733d3"]], // Harvest key
    keyFields: [],
    dataFields: [
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
    ],
    additionalFields: [
      {
        name: "user",
        source: "custom",
        sqlType: "text",
        customLogic: () => "", // Will be set in onEvent
      },
      {
        name: "contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          return standariseAddress(event.address);
        },
      },
      {
        name: "price",
        source: "custom",
        sqlType: "numeric(5,2)",
        customLogic: () => 0,
      },
    ],
  },
];
