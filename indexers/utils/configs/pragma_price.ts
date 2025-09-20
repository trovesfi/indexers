import { ContractAddr, EkuboCLVaultStrategies, UniversalStrategies, VesuRebalanceStrategies } from "@strkfarm/sdk";
import { standariseAddress } from "../../../src/utils";
import { AdditionalField, ContractConfig, EventConfig } from "../config";
import { onEventEkuboVault } from "../ekubo_vault";
import { eventKey } from "../common_transform";
import { toBigInt } from "..";

const PRAGMA_ADDRESS = '0x02a85bd616f912537c50a49a4076db02c00b29b2cdc8a197ce92ed1837fa875b';
  
export const CONFIG_PRAGMA_PRICE: EventConfig[] = [
    {
      tableName: "raw_price_events",
      includeReceipt: true,
      contracts: [{
        address: standariseAddress(PRAGMA_ADDRESS),
        asset: '',
        name: 'Pragma',
      }],
      defaultKeys: [
        [eventKey("SubmittedSpotEntry")], // for usual ERC4626 vaults
      ],
      keyFields: [],
      dataFields: [
        { name: "timestamp", type: "u64", sqlType: "numeric(20,0)" },
        { name: "source", type: "decoded_text", sqlType: "text" }, // e.g. 0x50595448 => PYTH
        { name: "publisher", type: "decoded_text", sqlType: "text" }, // e.g. 0x505241474d41 => PRAGMA
        { name: "price", type: "u128", sqlType: "numeric(78,0)" },
        { name: "pair_id", type: "felt252", sqlType: "text" },
        { name: "volume", type: "u128", sqlType: "numeric(78,0)" },
      ],
      additionalFields: [],
    }
];