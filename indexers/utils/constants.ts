import "dotenv/config";

import { standariseAddress } from "./index";
import { ContractAddr } from "@strkfarm/sdk";

export const CONTRACTS_INFO = {
  loanguard: {
    address:
      "0x534475ec241a43cf5da17420ef9b20409ca74563971332355ee2706d9ebafb2",
    start_block: 655531,
  },
};

export const TOKENS = {
  USDC: standariseAddress(
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
  ),
  ETH: standariseAddress(
    "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
  ),
  STRK: standariseAddress(
    "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
  ),
  USDT: standariseAddress(
    "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8"
  ),
};

export const isTLS = process.env.IS_TLS! === "true";

export const HC_EkuboCLVaultV2Strategies = [
  {
    "id": "ekubo_cl_xstrkstrk_v2",
    "name": "Ekubo xSTRK/STRK V2",
    "description": {
      "type": "div",
      "key": null,
      "props": {
        "children": [
          {
            "type": "p",
            "key": null,
            "props": {
              "children": {
                "key": null,
                "props": {
                  "children": [
                    {
                      "type": "span",
                      "key": "0",
                      "props": {
                        "children": "Deploys your xSTRK/STRK into an "
                      },
                      "_owner": null,
                      "_store": {}
                    },
                    {
                      "type": "a",
                      "key": "1",
                      "props": {
                        "href": "https://app.ekubo.org/positions",
                        "target": "_blank",
                        "style": {
                          "color": "white",
                          "background": "rgba(255, 255, 255, 0.04)"
                        },
                        "children": "Ekubo liquidity pool"
                      },
                      "_owner": null,
                      "_store": {}
                    },
                    {
                      "type": "span",
                      "key": "2",
                      "props": {
                        "children": ", automatically rebalancing positions around the current price to optimize yield and reduce the need for manual adjustments. Trading fees and any rewards are automatically compounded back into the strategy. In return, you receive an "
                      },
                      "_owner": null,
                      "_store": {}
                    },
                    {
                      "type": "a",
                      "key": "3",
                      "props": {
                        "href": "https://www.investopedia.com/news/what-erc20-and-what-does-it-mean-ethereum/",
                        "target": "_blank",
                        "style": {
                          "color": "white",
                          "background": "rgba(255, 255, 255, 0.04)"
                        },
                        "children": "ERC-20 token"
                      },
                      "_owner": null,
                      "_store": {}
                    },
                    {
                      "type": "span",
                      "key": "4",
                      "props": {
                        "children": " representing your share of the strategy"
                      },
                      "_owner": null,
                      "_store": {}
                    }
                  ]
                },
                "_owner": null,
                "_store": {}
              }
            },
            "_owner": null,
            "_store": {}
          },
          {
            "type": "div",
            "key": null,
            "props": {
              "style": {
                "padding": "16px 16px",
                "background": "var(--chakra-colors-mycard_light)",
                "marginTop": "16px",
                "borderRadius": "16px"
              },
              "children": [
                {
                  "type": "h4",
                  "key": null,
                  "props": {
                    "style": { "fontWeight": "bold" },
                    "children": "Key points to note:"
                  },
                  "_owner": null,
                  "_store": {}
                },
                {
                  "type": "div",
                  "key": null,
                  "props": {
                    "style": {
                      "display": "flex",
                      "flexDirection": "column",
                      "gap": "10px",
                      "color": "var(--chakra-colors-text_secondary)"
                    },
                    "children": [
                      {
                        "type": "p",
                        "key": null,
                        "props": {
                          "style": {},
                          "children": "1. During withdrawal, you may receive either or both tokens depending on market conditions and prevailing prices."
                        },
                        "_owner": null,
                        "_store": {}
                      },
                      {
                        "type": "p",
                        "key": null,
                        "props": {
                          "style": {},
                          "children": [
                            "2. Sometimes you might see a negative APY — this is usually not a big deal. It happens when ",
                            "xSTRK",
                            "'s price drops on DEXes, but things typically bounce back within a few days or a week."
                          ]
                        },
                        "_owner": null,
                        "_store": {}
                      }
                    ]
                  },
                  "_owner": null,
                  "_store": {}
                }
              ]
            },
            "_owner": null,
            "_store": {}
          }
        ]
      },
      "_owner": null,
      "_store": {}
    },
    "address": ContractAddr.from("0x1506fb193c839e93bc994badaf8b7f8a97357a522d85db5f9de285fc347d08b"),
    "launchBlock": 0,
    "type": "Other",
    "vaultType": {
      "type": "Automated LP",
      "description": "Automatically collects fees and rebalances positions on Ekubo to optimize yield"
    },
    "depositTokens": [
      {
        "name": "xSTRK",
        "symbol": "xSTRK",
        "logo": "https://assets.troves.fi/integrations/tokens/xstrk.svg",
        "address": {
          "address": "0x28d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a"
        },
        "decimals": 18,
        "priceCheckAmount": 1000,
        "displayDecimals": 2
      },
      {
        "name": "Starknet",
        "symbol": "STRK",
        "logo": "https://assets.troves.fi/integrations/tokens/strk.svg",
        "address": {
          "address": "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
        },
        "decimals": 18,
        "coingeckId": "starknet",
        "displayDecimals": 2,
        "priceCheckAmount": 1000
      }
    ],
    "protocols": [
      { "name": "Ekubo", "logo": "https://app.ekubo.org/favicon.ico" }
    ],
    "auditUrl": "https://docs.troves.fi/p/security#ekubo-vault",
    "curator": {
      "name": "Unwrap Labs",
      "logo": "https://assets.troves.fi/integrations/unwraplabs/white.png"
    },
    "risk": {
      "riskFactor": [
        {
          "type": "Smart Contract Risk",
          "value": 2,
          "weight": 34,
          "reason": "Audited smart contracts"
        },
        {
          "type": "Impermanent Loss Risk",
          "value": 1,
          "weight": 33,
          "reason": "Low risk due to co-related assets"
        },
        {
          "type": "Market Risk",
          "value": 1,
          "weight": 33,
          "reason": "Low risk due to co-related assets"
        },
        {
          "type": "Depeg Risk",
          "value": 2,
          "weight": 33,
          "reason": "Generally stable pegged assets"
        }
      ],
      "netRisk": 1.5037593984962405,
      "notARisks": [
        "Liquidation Risk",
        "Low Liquidity Risk",
        "Oracle Risk",
        "Technical Risk",
        "Counterparty Risk"
      ]
    },
    "apyMethodology": "APY based on 30-day historical performance, including fees and rewards.",
    "realizedApyMethodology": "The realizedAPY is based on past 14 days performance by the vault",
    "additionalInfo": {
      "newBounds": { "lower": -1, "upper": 1 },
      "lstContract": ContractAddr.from("0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a"),
      "feeBps": 1000,
      "rebalanceConditions": { "minWaitHours": 24, "direction": "uponly" },
      "quoteAsset": {
        "name": "Starknet",
        "symbol": "STRK",
        "logo": "https://assets.troves.fi/integrations/tokens/strk.svg",
        "address": ContractAddr.from("0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"),
        "decimals": 18,
        "coingeckId": "starknet",
        "displayDecimals": 2,
        "priceCheckAmount": 1000
      }
    },
    "settings": {
      "maxTVL": "0",
      "isAudited": false,
      "isPaused": false,
      "liveStatus": "Active",
      "isInstantWithdrawal": true,
      "hideNetEarnings": true,
      "isTransactionHistDisabled": true,
      "quoteToken": {
        "name": "Starknet",
        "symbol": "STRK",
        "logo": "https://assets.troves.fi/integrations/tokens/strk.svg",
        "address": {
          "address": "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
        },
        "decimals": 18,
        "coingeckId": "starknet",
        "displayDecimals": 2,
        "priceCheckAmount": 1000
      },
      "alerts": [
        {
          "type": "info",
          "text": {
            "type": "p",
            "key": null,
            "props": {
              "children": [
                "Depending on the current position range and price, your input amounts are automatically adjusted to nearest required amounts. If you have insufficient tokens, you can acquire the required tokens on",
                " ",
                {
                  "type": "a",
                  "key": null,
                  "props": {
                    "href": "https://avnu.fi",
                    "target": "_blank",
                    "rel": "noopener noreferrer",
                    "children": "Avnu"
                  },
                  "_owner": null,
                  "_store": {}
                }
              ]
            },
            "_owner": null,
            "_store": {}
          },
          "tab": "deposit"
        },
        {
          "type": "info",
          "text": {
            "key": null,
            "props": {
              "children": "Depending on the current position range and price, you may receive both of the tokens or one of the tokens depending on the price"
            },
            "_owner": null,
            "_store": {}
          },
          "tab": "withdraw"
        }
      ],
      "tags": ["Ekubo"]
    },
    "faqs": [
      {
        "question": "What is the Ekubo CL Vault strategy?",
        "answer": "The Ekubo CL Vault strategy deploys your assets into an Ekubo liquidity pool, automatically rebalancing positions around the current price to optimize yield and reduce manual adjustments."
      },
      {
        "question": "How are trading fees and rewards handled?",
        "answer": "Trading fees and any rewards are automatically compounded back into the strategy, increasing your overall returns."
      },
      {
        "question": "What happens during withdrawal?",
        "answer": "During withdrawal, you may receive either or both tokens depending on market conditions and prevailing prices."
      },
      {
        "question": "Are there any deposit/withdrawal fees?",
        "answer": "No, there are no deposit/withdrawal fees. However, there is a performance fee varying between 10-20% of the fees and rewards generated. The exact fee is determined by the strategy and the APY shown is net of this fee."
      },
      {
        "question": "Is the strategy audited?",
        "answer": {
          "type": "div",
          "key": null,
          "props": {
            "children": [
              "Yes, the strategy has been audited. You can review the audit report in our docs",
              " ",
              {
                "type": "a",
                "key": null,
                "props": {
                  "href": "https://docs.troves.fi/p/ekubo-cl-vaults#technical-details",
                  "style": {
                    "textDecoration": "underline",
                    "marginLeft": "5px"
                  },
                  "children": "Here"
                },
                "_owner": null,
                "_store": {}
              },
              "."
            ]
          },
          "_owner": null,
          "_store": {}
        }
      },
      {
        "question": "Why might I see a negative APY?",
        "answer": "A negative APY can occur when xSTRK's price drops on DEXes. This is usually temporary and tends to recover within a few days or a week."
      }
    ],
    "points": [
      {
        "multiplier": 1,
        "logo": "https://endur.fi/favicon.ico",
        "toolTip": "This strategy holds xSTRK and STRK tokens. Earn 1x Endur points on your xSTRK portion of Liquidity. STRK portion will earn Endur's DEX Bonus points. Points can be found on endur.fi."
      }
    ],
    "tags": ["Ekubo"],
    "contractDetails": [
      {
        "address": {
          "address": "0x1506fb193c839e93bc994badaf8b7f8a97357a522d85db5f9de285fc347d08b"
        },
        "name": "Vault",
        "sourceCodeUrl": "https://github.com/strkfarm/ekubo-cl-vaults/tree/main/src/cl_vault"
      }
    ],
    "investmentSteps": [
      "Supply tokens to Ekubo's pool",
      "Monitor and Rebalance position to optimize yield",
      "Harvest and re-invest any rewards every week (Auto-compound)"
    ],
    "security": {
      "auditStatus": "Not Audited",
      "sourceCode": {
        "type": "Closed Source",
        "contractLink": "https://github.com/strkfarm/ekubo-cl-vaults/tree/main/src/cl_vault"
      },
      "accessControl": {
        "type": "Role Based Access",
        "addresses": [
          {
            "address": "0x636a3f51cc37f5729e4da4b1de6a8549a28f3c0d5bf3b17f150971e451ff9c2"
          }
        ]
      }
    },
    "redemptionInfo": {
      "instantWithdrawalVault": "Yes",
      "redemptionsInfo": [],
      "alerts": []
    },
    "usualTimeToEarnings": null,
    "usualTimeToEarningsDescription": null,
    "docs": "https://docs.troves.fi/p/ekubo-cl-vaults"
  }
]
