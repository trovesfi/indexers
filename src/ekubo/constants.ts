// export const CONTRACTS_INFO = {
//     loanguard: {
//         address: '0x534475ec241a43cf5da17420ef9b20409ca74563971332355ee2706d9ebafb2',
//         start_block: 655531,
//     }
// }

// export const TOKENS = {
//     USDC: standariseAddress('0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'),
//     ETH: standariseAddress('0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'),
//     STRK: standariseAddress('0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'),
//     USDT: standariseAddress('0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8')
// };

export const isTLS =
  typeof (globalThis as any).Deno !== "undefined" &&
  (globalThis as any).Deno.env.get("IS_TLS") === "true";

export interface ContractInfo {
  salt: string; // store as string to match DB types
  owner: string;
}

export const CONTRACT_MAP: Record<string, ContractInfo> = {
  "0x01f083b98674bc21effee29ef443a00c7b9a500fd92cf30341a3da12c73f2324": {
    salt: "1269084",
    owner: "0x2e0af29598b407c8716b17f6d2795eca1b471413fa03fb145a5e33722184067",
  },
};
