import "dotenv/config";
import { standariseAddress } from "../src/utils";
import { TOKENS } from "../src/strkfarm/constants";

// Event keys
export const DEPOSIT_KEY = "0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2";
export const WITHDRAW_KEY = "0x17f87ab38a7f75a63dc465e10aadacecfca64c44ca774040b039bfb004e3367";
export const REDEEM_KEY = "0xfc5c8e7953c62fb357aebe6619c766f40a3e56113ec060b82286f715b6a7dc";
export const CLAIM_KEY = "0x0306482a50ea1a82bc2c1d79de5baf013f58ee2260881f6b6c60d31833ef220d";
export const ERC4626_EVENT = "0x20c620f0d41f84d5dcefe97ae96fb9becabb508b15b411d8f34aded3a984986";

// Contract addresses
const VESU_STRATEGIES = [
  {
    address: "0x7fb5bcb8525954a60fde4e8fb8220477696ce7117ef264775a1770e23571929",
    name: "Vesu Fusion STRK",
    asset: TOKENS.STRK,
  },
  {
    name: "Vesu Fusion ETH",
    address: "0x5eaf5ee75231cecf79921ff8ded4b5ffe96be718bcb3daf206690ad1a9ad0ca",
    asset: TOKENS.ETH,
  },
  {
    name: "Vesu Fusion USDC",
    address: "0xa858c97e9454f407d1bd7c57472fc8d8d8449a777c822b41d18e387816f29c",
    asset: TOKENS.USDC,
  },
  {
    name: "Vesu Fusion USDT",
    address: "0x115e94e722cfc4c77a2f15c4aefb0928c1c0029e5a57570df24c650cb7cec2c",
    asset: TOKENS.USDT,
  },
];

const EVERGREEN_VAULTS = [
  {
    address: "0x7e6498cf6a1bfc7e6fc89f1831865e2dacb9756def4ec4b031a9138788a3b5e",
    name: "USDC Evergreen",
    asset: "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  },
  {
    address: "0x5a4c1651b913aa2ea7afd9024911603152a19058624c3e425405370d62bf80c",
    name: "WBTC Evergreen",
    asset: "0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
  },
  {
    address: "0x446c22d4d3f5cb52b4950ba832ba1df99464c6673a37c092b1d9622650dbd8",
    name: "ETH Evergreen",
    asset: "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  },
  {
    address: "0x55d012f57e58c96e0a5c7ebbe55853989d01e6538b15a95e7178aca4af05c21",
    name: "STRK Evergreen",
    asset: "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  },
  {
    address: "0x1c4933d1880c6778585e597154eaca7b428579d72f3aae425ad2e4d26c6bb3",
    name: "USDT Evergreen",
    asset: "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  },
];

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
  customLogic?: (event: any, transaction: any, header: any) => any;
}

export interface EventConfig {
  tableName: string;
  keys: string[];
  contractAddress: `0x${string}`;
  processor: string;
  asset: string;
  fields: EventField[];
  additionalFields: AdditionalField[];
}

export const CONFIG: Record<string, EventConfig> = {
  // DNMM Contracts
  dnmmDepositWithdraw: {
    tableName: "investment_flows",
    keys: [DEPOSIT_KEY, WITHDRAW_KEY],
    contractAddress: standariseAddress("0x7023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b") as `0x${string}`,
    processor: "dnmm",
    asset: TOKENS.STRK,
    fields: [
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "receiver", type: "ContractAddress", sqlType: "text" },
      { name: "owner", type: "ContractAddress", sqlType: "text" },
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
      { name: "type", type: "text", sqlType: "text" },
    ],
    additionalFields: [
      {
        name: "contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => event.address,
      },
      {
        name: "asset",
        source: "custom",
        sqlType: "text",
        customLogic: () => TOKENS.STRK,
      },
    ],
  },

  // ERC4626 Contracts
  ...VESU_STRATEGIES.reduce((acc, strategy) => {
    acc[`vesu_${strategy.asset.toLowerCase()}`] = {
      tableName: "investment_flows",
      keys: [DEPOSIT_KEY, WITHDRAW_KEY],
      contractAddress: standariseAddress(strategy.address),
      processor: "erc4626",
      asset: strategy.asset,
      fields: [
        { name: "sender", type: "ContractAddress", sqlType: "text" },
        { name: "receiver", type: "ContractAddress", sqlType: "text" },
        { name: "owner", type: "ContractAddress", sqlType: "text" },
        { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
        { name: "type", type: "text", sqlType: "text" },
      ],
      additionalFields: [
        {
          name: "contract",
          source: "custom",
          sqlType: "text",
          customLogic: (event) => event.address,
        },
        {
          name: "asset",
          source: "custom",
          sqlType: "text",
          customLogic: () => strategy.asset,
        },
      ],
    };
    return acc;
  }, {}),

  // Additional ERC4626 contracts
  erc4626Usdc: {
    tableName: "investment_flows",
    keys: [DEPOSIT_KEY, WITHDRAW_KEY],
    contractAddress: standariseAddress("0x016912b22d5696e95ffde888ede4bd69fbbc60c5f873082857a47c543172694f") as `0x${string}`,
    processor: "erc4626",
    asset: TOKENS.USDC,
    fields: [
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "receiver", type: "ContractAddress", sqlType: "text" },
      { name: "owner", type: "ContractAddress", sqlType: "text" },
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
      { name: "type", type: "text", sqlType: "text" },
    ],
    additionalFields: [
      {
        name: "contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => event.address,
      },
      {
        name: "asset",
        source: "custom",
        sqlType: "text",
        customLogic: () => TOKENS.USDC,
      },
    ],
  },

  erc4626Strk: {
    tableName: "investment_flows",
    keys: [DEPOSIT_KEY, WITHDRAW_KEY],
    contractAddress: standariseAddress("0x541681b9ad63dff1b35f79c78d8477f64857de29a27902f7298f7b620838ea") as `0x${string}`,
    processor: "erc4626",
    asset: TOKENS.STRK,
    fields: [
      { name: "sender", type: "ContractAddress", sqlType: "text" },
      { name: "receiver", type: "ContractAddress", sqlType: "text" },
      { name: "owner", type: "ContractAddress", sqlType: "text" },
      { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
      { name: "type", type: "text", sqlType: "text" },
    ],
    additionalFields: [
      {
        name: "contract",
        source: "custom",
        sqlType: "text",
        customLogic: (event) => event.address,
      },
      {
        name: "asset",
        source: "custom",
        sqlType: "text",
        customLogic: () => TOKENS.STRK,
      },
    ],
  },

  // Starknet Vault Kit Contracts
  ...EVERGREEN_VAULTS.reduce((acc, vault) => {
    acc[`evergreen_${vault.name.toLowerCase().replace(/\s+/g, '_')}`] = {
      tableName: "investment_flows",
      keys: [ERC4626_EVENT, REDEEM_KEY, CLAIM_KEY],
      contractAddress: standariseAddress(vault.address),
      processor: "starknetVaultKit",
      asset: vault.asset,
      fields: [
        { name: "sender", type: "ContractAddress", sqlType: "text" },
        { name: "receiver", type: "ContractAddress", sqlType: "text" },
        { name: "owner", type: "ContractAddress", sqlType: "text" },
        { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
        { name: "request_id", type: "u256", sqlType: "numeric(78,0)" },
        { name: "epoch", type: "u256", sqlType: "numeric(78,0)" },
        { name: "type", type: "text", sqlType: "text" },
      ],
      additionalFields: [
        {
          name: "contract",
          source: "custom",
          sqlType: "text",
          customLogic: (event) => event.address,
        },
        {
          name: "asset",
          source: "custom",
          sqlType: "text",
          customLogic: () => vault.asset,
        },
      ],
    };
    return acc;
  }, {}),
};

export function getEventConfig(eventKey: string): EventConfig | undefined {
  return Object.values(CONFIG).find(config => 
    config.keys.includes(eventKey)
  );
}