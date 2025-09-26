import { ContractAddr, EkuboCLVaultStrategies, UniversalStrategies, VesuRebalanceStrategies } from "@strkfarm/sdk";
import { standariseAddress } from "../../../src/utils";
import { AdditionalField, ContractConfig, EventConfig } from "../config";
import { onEventEkuboVault } from "../ekubo_vault";
import { eventKey } from "../common_transform";

const EKUBO_VAULT_CONTRACTS: ContractConfig[] = [
    ...EkuboCLVaultStrategies.map((ekuboStrat) => ({
      address: standariseAddress(ekuboStrat.address.address),
      asset: '', // not applicable for this dual asset vault
      name: ekuboStrat.name,
    })).filter((strat) => strat.name.toLowerCase().includes('re7')),
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
      ],
    },
];