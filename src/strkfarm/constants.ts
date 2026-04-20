import { standariseAddress } from "../utils.ts";

export const CONTRACTS_INFO = {
    loanguard: {
        address: '0x534475ec241a43cf5da17420ef9b20409ca74563971332355ee2706d9ebafb2',
        start_block: 655531,
    }
}

export const TOKENS = {
    USDC: standariseAddress('0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'),
    // Native USDC (non-bridged)
    USDC_NATIVE: standariseAddress('0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb'),
    ETH: standariseAddress('0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'),
    STRK: standariseAddress('0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'),
    USDT: standariseAddress('0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8'),

    // BTC-family assets (needed for Ekubo LST vaults + YOLO vaults)
    WBTC: standariseAddress('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac'),
    tBTC: standariseAddress('0x04daa17763b286d1e59b97c283c0b8c949994c361e426a28f743c67bdfe9a32f'),
    solvBTC: standariseAddress('0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68'),
    LBTC: standariseAddress('0x036834a40984312f7f7de8d31e3f6305b325389eaeea5b1c0664b2fb936461a4'),
    xWBTC: standariseAddress('0x06a567e68c805323525fe1649adb80b03cddf92c23d2629a6779f54192dffc13'),
    xSTRK: standariseAddress('0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a'),
};

export const isTLS = Deno.env.get("IS_TLS") === 'true';