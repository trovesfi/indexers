import {
  UniversalStrategies,
  HyperLSTStrategies,
  EkuboCLVaultStrategies,
  YoloVaultStrategies,
  SenseiStrategies,
  VesuRebalanceStrategies,
} from "@strkfarm/sdk";
import { BoostedxSTRKCarryStrategies } from "strkfarm-sdk-dev";
import { standariseAddress } from "../../../src/utils";
import { ContractConfig, EventConfig } from "../config";
import { eventKey } from "../common_transform";
// sdk is not ready to go live hence to run the indexer this vault has been hardcoded. Remember to remove it once sdk have required changes published.
import { HC_EkuboCLVaultV2Strategies as EkuboCLVaultV2Strategies } from "../constants";
import { EKUBO_VAULT_CONTRACTS_V2 } from "./investment_flows_erc4626";

// Derive global (role-based) AC contracts dynamically from all SDK strategy lists.
// Any strategy whose security.accessControl.type === ROLE_BASED_ACCESS contributes
// its AC contract address(es). Addresses of 0x0 are placeholders (not yet deployed)
// and are skipped. Duplicates are deduplicated so each AC contract appears once.
const ALL_STRATEGY_LISTS = [
  EkuboCLVaultStrategies,
  EKUBO_VAULT_CONTRACTS_V2,
  YoloVaultStrategies,
  SenseiStrategies,
  VesuRebalanceStrategies,
  UniversalStrategies,
  HyperLSTStrategies,
  BoostedxSTRKCarryStrategies,
] as any[][];

const ZERO = standariseAddress("0x0");

const _seenAcAddresses = new Set<string>();
const GLOBAL_ACCESS_CONTROL_CONTRACTS: ContractConfig[] = [];

for (const strategies of ALL_STRATEGY_LISTS) {
  for (const strategy of strategies) {
    const ac = strategy.security?.accessControl;
    if (ac?.type !== "Role Based Access") continue;
    for (const addrObj of (ac.addresses ?? [])) {
      const normalised = standariseAddress(addrObj.address);
      if (normalised === ZERO) continue; // placeholder — not deployed/indexed yet
      if (_seenAcAddresses.has(normalised)) continue;
      _seenAcAddresses.add(normalised);
      const len = GLOBAL_ACCESS_CONTROL_CONTRACTS.length;
      GLOBAL_ACCESS_CONTROL_CONTRACTS.push({
        address: normalised,
        asset: "",
        name: `Access Control ${len+1}`,
      });
    }
  }
}

// Universal Strategies - Extract vault and manager addresses dynamically from SDK
const UNIVERSAL_STRATEGY_CONTRACTS: ContractConfig[] = [
  // Vault addresses
  ...UniversalStrategies.map((strategy) => ({
    address: standariseAddress(strategy.address.address),
    asset: "",
    name: `${strategy.name} Vault`,
  })),
  // Manager addresses
  ...UniversalStrategies.map((strategy) => ({
    address: standariseAddress(strategy.additionalInfo.manager.address),
    asset: "",
    name: `${strategy.name} Manager`,
  })),
];

// HyperLST Strategies - Extract vault and manager addresses dynamically from SDK
const HYPERLST_STRATEGY_CONTRACTS: ContractConfig[] = [
  // Vault addresses
  ...HyperLSTStrategies.map((strategy) => ({
    address: standariseAddress(strategy.address.address),
    asset: "",
    name: `${strategy.name} Vault`,
  })),
  // Manager addresses
  ...HyperLSTStrategies.map((strategy) => ({
    address: standariseAddress(strategy.additionalInfo.manager.address),
    asset: "",
    name: `${strategy.name} Manager`,
  })),
];

// Boosted Strategies - Extract vault and manager addresses dynamically from SDK
const BOOSTED_STRATEGY_CONTRACTS: ContractConfig[] = [
  // Vault addresses
  ...BoostedxSTRKCarryStrategies.map((strategy) => ({
    address: standariseAddress(strategy.address.address),
    asset: "",
    name: `${strategy.name} Vault`,
  })),
  // Manager addresses
  ...BoostedxSTRKCarryStrategies.map((strategy) => ({
    address: standariseAddress(strategy.additionalInfo.manager.address),
    asset: "",
    name: `${strategy.name} Manager`,
  })),
];

// Combine all access control contracts
const ALL_ACCESS_CONTROL_CONTRACTS: ContractConfig[] = [
  ...GLOBAL_ACCESS_CONTROL_CONTRACTS,
  ...UNIVERSAL_STRATEGY_CONTRACTS,
  ...HYPERLST_STRATEGY_CONTRACTS,
  ...BOOSTED_STRATEGY_CONTRACTS,
];

// Lookup map of known role selector hashes to human-readable names.
// Keys are standarised (leading zeros stripped) to match what standariseAddress() produces.
// Roles in Cairo are computed via selector!("ROLE_NAME") which produces a keccak256
// hash — they cannot be decoded back to strings, so a static map is required.
const KNOWN_ROLE_NAMES: Record<string, string> = {
  // DEFAULT_ADMIN_ROLE = 0
  "0x0": "DEFAULT_ADMIN_ROLE",
  // selector!("GOVERNOR")
  "0x26838efa4183e08fe3607359d1259272af9d4716f65e1a7b5921f78fd5a3c6a":
    "GOVERNOR",
  // selector!("RELAYER")
  "0x34f864e5201b0fde9b5ee3e4cf96384802b0ffdfcf7f9de4699ce21a30afc4f":
    "RELAYER",
  // selector!("EMERGENCY_ACTOR")
  "0x34cde74b9063efe5d744d0e7c535eca81c0e48ad60da32f9963463ceb475c4b":
    "EMERGENCY_ACTOR",
  // selector!("OWNER_ROLE")
  "0x19546dff01e856fb3f010c267a7b1c60363cf8a4664e21cc89c26224620214e":
    "OWNER_ROLE",
  // selector!("PAUSER_ROLE")
  "0x1d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a":
    "PAUSER_ROLE",
  // selector!("ORACLE_ROLE")
  "0xe79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1":
    "ORACLE_ROLE",
};

// Helper function to decode role name from felt252.
// Normalises the input via standariseAddress first so map keys always match.
function decodeRoleName(roleHex: string): string {
  const normalised = standariseAddress(roleHex);
  return (
    KNOWN_ROLE_NAMES[normalised] ??
    `UNKNOWN_ROLE_${normalised.substring(0, 10)}`
  );
}

export const CONFIG_ACTIVE_PERMISSIONS: EventConfig[] = [
  // RoleGranted Event
  {
    tableName: "role_events",
    contracts: ALL_ACCESS_CONTROL_CONTRACTS,
    defaultKeys: [
      [eventKey("AccessControlEvent"), eventKey("RoleGranted")],
      [eventKey("RoleGranted")],
    ],
    keyFields: [],
    dataFields: [
      { name: "role", type: "text", sqlType: "text" },
      { name: "account", type: "ContractAddress", sqlType: "text" },
      { name: "sender", type: "ContractAddress", sqlType: "text" },
    ],
    additionalFields: [
      {
        name: "event_type",
        source: "custom",
        sqlType: "text",
        customLogic: () => "RoleGranted",
      },
      {
        name: "contract_address",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => standariseAddress(event.address),
      },
      {
        name: "role_name",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          // role is the first data field
          const roleHex = standariseAddress(event.data[0]);
          return decodeRoleName(roleHex);
        },
      },
      {
        name: "previous_admin_role",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "previous_admin_role_name",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "new_admin_role",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "new_admin_role_name",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
    ],
  },
  // RoleGrantedWithDelay Event
  {
    tableName: "role_events",
    contracts: ALL_ACCESS_CONTROL_CONTRACTS,
    defaultKeys: [
      [eventKey("AccessControlEvent"), eventKey("RoleGrantedWithDelay")],
      [eventKey("RoleGrantedWithDelay")],
    ],
    keyFields: [],
    dataFields: [
      { name: "role", type: "text", sqlType: "text" },
      { name: "account", type: "ContractAddress", sqlType: "text" },
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "delay", type: "u64", sqlType: "skip" },
    ],
    additionalFields: [
      {
        name: "event_type",
        source: "custom",
        sqlType: "text",
        customLogic: () => "RoleGrantedWithDelay",
      },
      {
        name: "contract_address",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => standariseAddress(event.address),
      },
      {
        name: "role_name",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          // role is the first data field
          const roleHex = standariseAddress(event.data[0]);
          return decodeRoleName(roleHex);
        },
      },
      {
        name: "previous_admin_role",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "previous_admin_role_name",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "new_admin_role",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "new_admin_role_name",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
    ],
  },
  // RoleRevoked Event
  {
    tableName: "role_events",
    contracts: ALL_ACCESS_CONTROL_CONTRACTS,
    defaultKeys: [
      [eventKey("AccessControlEvent"), eventKey("RoleRevoked")],
      [eventKey("RoleRevoked")],
    ],
    keyFields: [],
    dataFields: [
      { name: "role", type: "text", sqlType: "text" },
      { name: "account", type: "ContractAddress", sqlType: "text" },
      { name: "sender", type: "ContractAddress", sqlType: "text" },
    ],
    additionalFields: [
      {
        name: "event_type",
        source: "custom",
        sqlType: "text",
        customLogic: () => "RoleRevoked",
      },
      {
        name: "contract_address",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => standariseAddress(event.address),
      },
      {
        name: "role_name",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          // role is the first data field
          const roleHex = standariseAddress(event.data[0]);
          return decodeRoleName(roleHex);
        },
      },
      {
        name: "previous_admin_role",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "previous_admin_role_name",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "new_admin_role",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "new_admin_role_name",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
    ],
  },
  // RoleAdminChanged Event
  {
    tableName: "role_events",
    contracts: ALL_ACCESS_CONTROL_CONTRACTS,
    defaultKeys: [
      [eventKey("AccessControlEvent"), eventKey("RoleAdminChanged")],
      [eventKey("RoleAdminChanged")],
    ],
    keyFields: [],
    dataFields: [
      { name: "role", type: "text", sqlType: "text" },
      { name: "previous_admin_role", type: "text", sqlType: "text" },
      { name: "new_admin_role", type: "text", sqlType: "text" },
    ],
    additionalFields: [
      {
        name: "event_type",
        source: "custom",
        sqlType: "text",
        customLogic: () => "RoleAdminChanged",
      },
      {
        name: "contract_address",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => standariseAddress(event.address),
      },
      {
        name: "role_name",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          // role is the first data field
          const roleHex = standariseAddress(event.data[0]);
          return decodeRoleName(roleHex);
        },
      },
      {
        name: "previous_admin_role_name",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          // previous_admin_role is the second data field
          const roleHex = standariseAddress(event.data[1]);
          return decodeRoleName(roleHex);
        },
      },
      {
        name: "new_admin_role_name",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => {
          // new_admin_role is the third data field
          const roleHex = standariseAddress(event.data[2]);
          return decodeRoleName(roleHex);
        },
      },
      {
        name: "account",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
      {
        name: "sender",
        source: "custom",
        sqlType: "text",
        customLogic: () => null,
      },
    ],
  },
];
