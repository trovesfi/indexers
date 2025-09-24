import { ContractAddr, EkuboCLVaultStrategies, HyperLSTStrategies, UniversalStrategies, VesuRebalanceStrategies } from "@strkfarm/sdk";
import { standariseAddress } from "../../../src/utils";
import { AdditionalField, ContractConfig, EventConfig } from "../config";
import { onEventEkuboVault } from "../ekubo_vault";
import { eventKey } from "../common_transform";
import { toBigInt } from "..";

const UNIVERSAL_STRATEGIES: ContractConfig[] = [
    // universal strategies (starknet vault kit)
    ...UniversalStrategies.map((evergreenVault) => ({
      address: standariseAddress(evergreenVault.address.address),
      asset: evergreenVault.depositTokens[0].address.address,
      name: evergreenVault.name,
    })),
    ...HyperLSTStrategies.map((hyperLST) => ({
      address: standariseAddress(hyperLST.address.address),
      asset: hyperLST.depositTokens[0].address.address,
      name: hyperLST.name,
    })),
];

  
const commonInvestmentFlowAdditionalFields = (type: "deposit" | "withdraw"): AdditionalField[] => {
    return [{
      name: "receiver",
      source: "custom",
      sqlType: "text",
      customLogic: (event) => {
        return standariseAddress(event.keys[3]); // same as owner
      },
    },
    {
      name: "asset",
      source: "custom",
      sqlType: "text",
      customLogic: (event) => {
        // not applicable for this vault
        const contractInfo = UNIVERSAL_STRATEGIES.find((strat) => ContractAddr.from(strat.address).eqString(event.address));
        if (!contractInfo) {
          throw new Error(`Unknown contract: ${standariseAddress(event.address)}`);
        }
        return standariseAddress(contractInfo.asset);
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
      customLogic: (event) => {
        if (type == 'deposit') {
          return 0;
        } else if (type == 'withdraw') {
            const isRedeem = standariseAddress(event.keys[0]) == standariseAddress(eventKey("RedeemRequested"));
            return isRedeem ? toBigInt(event.data[8]).toString() : toBigInt(event.data[7]).toString();
        }
        throw new Error(`Unknown type: ${type}`);
      }
    },
    {
      name: "request_id",
      source: "custom",
      sqlType: "numeric(20,0)",
      customLogic: (event) => {
        if (type == 'deposit') {
          return 0;
        } else if (type == 'withdraw') {
          const isRedeem = standariseAddress(event.keys[0]) == standariseAddress(eventKey("RedeemRequested"));
          return isRedeem ? toBigInt(event.data[6]).toString() : toBigInt(event.data[5]).toString();
        }
        throw new Error(`Unknown type: ${type}`);
      },
    },
    {
      name: "type",
      source: "custom",
      sqlType: "text",
      customLogic: (event) => {
        if (type == 'deposit') {
          return 'deposit';
        } else if (type == 'withdraw') {
          const isRedeem = standariseAddress(event.keys[0]) == standariseAddress(eventKey("RedeemRequested"));
          return isRedeem ? 'redeem' : 'claim';
        }
        throw new Error(`Unknown type: ${type}`);
      },
    }]
}

export const CONFIG_INVESTMENT_FLOWS_STARKNET_VAULT_KIT: EventConfig[] = [
    {
      tableName: "investment_flows",
      includeReceipt: true,
      contracts: UNIVERSAL_STRATEGIES,
      defaultKeys: [
        [eventKey("ERC4626Event"), eventKey("Deposit")], // for usual ERC4626 vaults
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
      contracts: UNIVERSAL_STRATEGIES,
      defaultKeys: [
        [eventKey("RedeemRequested")],
      ],
      keyFields: [],
      dataFields: [
        { name: "owner", type: "ContractAddress", sqlType: "text" },
        { name: "receiver", type: "ContractAddress", sqlType: "text" },
        { name: "shares", type: "u256", sqlType: "numeric(78,0)" },
        { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
        { name: "id", type: "u256", sqlType: "skip" },
        { name: "epoch", type: "u256", sqlType: "skip" },
      ],
      additionalFields: [
        {
            name: "sender",
            source: "custom",
            sqlType: "text",
            customLogic: (event) => {
                return '' // not applicable for this event key
            },
        },
        // receiver is not applicable for this event key
        ...commonInvestmentFlowAdditionalFields("withdraw").filter((field) => {
          return field.name !== "receiver"
        })
      ]
    },
    {
        tableName: "investment_flows",
        includeReceipt: true,
        contracts: UNIVERSAL_STRATEGIES,
        defaultKeys: [
          [eventKey("RedeemClaimed")],
        ],
        keyFields: [],
        dataFields: [
          { name: "receiver", type: "ContractAddress", sqlType: "text" },
          { name: "shares", type: "u256", sqlType: "numeric(78,0)" },
          { name: "amount", type: "u256", sqlType: "numeric(78,0)" },
          { name: "id", type: "u256", sqlType: "skip" },
          { name: "epoch", type: "u256", sqlType: "skip" },
        ],
        additionalFields: [
            {
                name: "sender",
                source: "custom",
                sqlType: "text",
                customLogic: (event) => {
                    return '' // not applicable for this event key
                },
            },
            {
                name: "owner",
                source: "custom",
                sqlType: "text",
                customLogic: (event) => {
                    return standariseAddress(event.data[0]); // same as receiver
                },
            },
            // receiver is not applicable for this event key
            ...commonInvestmentFlowAdditionalFields("withdraw").filter((field) => {
                return field.name !== "receiver"
            })
        ]
      }
];