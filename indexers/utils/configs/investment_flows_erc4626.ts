import { ContractAddr, EkuboCLVaultStrategies, EkuboCLVaultV2Strategies, UniversalStrategies, VesuRebalanceStrategies } from "@strkfarm/sdk";
import { standariseAddress } from "../../../src/utils";
import { AdditionalField, ContractConfig, EventConfig } from "../config";
import { onEventEkuboVault } from "../ekubo_vault";
import { eventKey } from "../common_transform";
import { uint256 } from "starknet";

export const EKUBO_VAULT_CONTRACTS: ContractConfig[] = [
    ...EkuboCLVaultStrategies
    .map((ekuboStrat) => ({
      address: standariseAddress(ekuboStrat.address.address),
      asset: '', // not applicable for this dual asset vault
      name: ekuboStrat.name,
    }))
];

export const EKUBO_VAULT_CONTRACTS_V2: ContractConfig[] = [
    ...EkuboCLVaultV2Strategies
    .map((ekuboV2Strat) => ({
      address: standariseAddress(ekuboV2Strat.address.address),
      asset: '', // not applicable for this dual asset vault
      name: ekuboV2Strat.name,
    }))
];

const ERC4626_VAULT_CONTRACTS: ContractConfig[] = [
    // vesu rebalance strategies
    ...VesuRebalanceStrategies.map((vesuStrat) => ({
        address: standariseAddress(vesuStrat.address.address),
        asset: vesuStrat.depositTokens[0].address.address,
        name: vesuStrat.name,
    })),
    // ekubo cl vault strategies
    ...EKUBO_VAULT_CONTRACTS,
];

  
const commonInvestmentFlowAdditionalFields = (type: "deposit" | "withdraw"): AdditionalField[] => {
    return [{
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
        const contractInfo = ERC4626_VAULT_CONTRACTS.find((strat) => ContractAddr.from(strat.address).eqString(event.address));
        if (!contractInfo) {
          throw new Error(`Unknown contract: ${standariseAddress(event.address)}`);
        }
        return contractInfo.asset ? standariseAddress(contractInfo.asset) : '';
      },
    }, {
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
        if (type == 'deposit') {
          return 0;
        }
        return 0;
      },
    },
    {
      name: "type",
      source: "custom",
      sqlType: "text",
      customLogic: () => type,
    }]
}

export const CONFIG_INVESTMENT_FLOWS_ERC4626: EventConfig[] = [
    {
      tableName: "investment_flows",
      includeReceipt: true,
      contracts: ERC4626_VAULT_CONTRACTS,
      onEvent: onEventEkuboVault, // to specially process ekubo vaults, skips others
      defaultKeys: [
        [eventKey("Deposit")], // for usual ERC4626 vaults
      ],
      keyFields: [
        { name: "sender", type: "ContractAddress", sqlType: "text" },
        { name: "owner", type: "ContractAddress", sqlType: "text" },
      ],
      dataFields: [
        { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
        { name: "shares", type: "u256", sqlType: "numeric(78,0)" },
      ],
      additionalFields: [
        ...commonInvestmentFlowAdditionalFields("deposit"),
      ],
    },
    {
      tableName: "investment_flows",
      includeReceipt: true,
      contracts: ERC4626_VAULT_CONTRACTS,
      onEvent: onEventEkuboVault,
      defaultKeys: [
        [eventKey("Withdraw")], // for usual ERC4626 vaults
      ],
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
        // receiver is not applicable for this event key
        ...commonInvestmentFlowAdditionalFields("withdraw").filter((field) => {
          return field.name !== "receiver"
        })
      ]
    },
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
        {
          name: "pool_info",
          source: "custom",
          sqlType: "text",
          customLogic: (event) => {
            // V1 events have 10 data elements, V2 events have 22
            // After u256 parsing: token0(1) + token0_origin_bal(2) + amount0(2) + 
            //                     token1(1) + token1_origin_bal(2) + amount1(2) = 10 felts
            // V2 adds ManagedPool struct: pool_key(7) + bounds(4) + nft_id(1) = 12 more felts
            if (event.data.length <= 10) {
              return null; // V1 contract - no pool_info
            }
            
            try {
              // Parse ManagedPool struct from event.data[10..21]
              // PoolKey: token0, token1, fee(u128 = 2 felts), tick_spacing(u128 = 2 felts), extension
              // Bounds: lower(i129 = 2 felts), upper(i129 = 2 felts)
              // nft_id: u64 (1 felt)
              const poolInfo = {
                pool_key: {
                  token0: standariseAddress(`0x${BigInt(event.data[10]).toString(16).padStart(64, "0")}`),
                  token1: standariseAddress(`0x${BigInt(event.data[11]).toString(16).padStart(64, "0")}`),
                  fee: uint256.uint256ToBN({ low: event.data[12], high: event.data[13] }).toString(),
                  tick_spacing: uint256.uint256ToBN({ low: event.data[14], high: event.data[15] }).toString(),
                  extension: standariseAddress(`0x${BigInt(event.data[16]).toString(16).padStart(64, "0")}`),
                },
                bounds: {
                  lower: {
                    mag: BigInt(event.data[17]).toString(),
                    sign: BigInt(event.data[18]).toString() === "1",
                  },
                  upper: {
                    mag: BigInt(event.data[19]).toString(),
                    sign: BigInt(event.data[20]).toString() === "1",
                  },
                },
                nft_id: BigInt(event.data[21]).toString(),
              };
              
              return JSON.stringify(poolInfo);
            } catch (error) {
              console.error("Error parsing pool_info:", error);
              return null;
            }
          },
        },
      ],
    },
];
