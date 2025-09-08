import "dotenv/config";

import { standariseAddress } from "../../src/utils";
import { TOKENS } from "../../src/strkfarm/constants";
import { eventKey } from "./common_transform";
import { hash } from "starknet";
import { Block, Event, TransactionReceipt } from "@apibara/starknet";
import { onEventEkuboVault } from "./ekubo_vault";

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
];
