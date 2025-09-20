import "dotenv/config";

import { Block, Event } from "@apibara/starknet";
import { VesuRebalanceStrategies, EkuboCLVaultStrategies, UniversalStrategies, ContractAddr } from "@strkfarm/sdk";

import { standariseAddress } from "../../src/utils";
import { eventKey } from "./common_transform";
import { onEventEkuboVault } from "./ekubo_vault";
import { CONFIG_INVESTMENT_FLOWS_ERC4626 } from "./configs/investment_flows_erc4626";
import { CONFIG_INVESTMENT_FLOWS_STARKNET_VAULT_KIT } from "./configs/investment_flows_starknet_vault_kit";
import { CONFIG_PRAGMA_PRICE } from "./configs/pragma_price";

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

export type OnEvent = (
  event: Event,
  processedRecord: Record<string, any>,
  allEvents: readonly Event[],
  block: Block
) => Promise<void>;

export interface EventConfig {
  tableName: string;
  contracts: ContractConfig[];
  keys?: `0x${string}`[][]; // custom key combinations
  defaultKeys: `0x${string}`[][]; // default keys if keys not specified
  keyFields: EventField[];
  dataFields: EventField[];
  additionalFields: AdditionalField[];
  includeReceipt?: boolean;
  onEvent?: OnEvent;
}

const EKUBO_VAULT_CONTRACTS: ContractConfig[] = [
  ...EkuboCLVaultStrategies.map((ekuboStrat) => ({
    address: standariseAddress(ekuboStrat.address.address),
    asset: '', // not applicable for this dual asset vault
    name: ekuboStrat.name,
  })),
];

const HARVEST_CONTRACTS: ContractConfig[] = [
  ...VesuRebalanceStrategies.map((vesuStrat) => ({
    address: standariseAddress(vesuStrat.address.address),
    asset: vesuStrat.depositTokens[0].address.address,
    name: vesuStrat.name,
  })),
  ...EKUBO_VAULT_CONTRACTS,
];


export const CONFIG: EventConfig[] = [
  ...CONFIG_PRAGMA_PRICE,
  ...CONFIG_INVESTMENT_FLOWS_ERC4626,
  ...CONFIG_INVESTMENT_FLOWS_STARKNET_VAULT_KIT,
  {
    tableName: "position_fees_collected",
    contracts: EKUBO_VAULT_CONTRACTS,
    defaultKeys: [[eventKey("HandleFees")]],
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
      },
    ],
  },
  {
    tableName: "harvests",
    contracts: HARVEST_CONTRACTS,
    defaultKeys: [
      ["0x7bfb812ef65292405e9c4e05f2befe48dae3e62d7ed27bada75d2384e733d3"],
    ], // Harvest key
    keyFields: [],
    dataFields: [
      // works for both single and dual token harvest configs
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
      { name: "base0Amount", type: "u256", sqlType: "skip" },
      { name: "base1Amount", type: "u256", sqlType: "skip" },
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
