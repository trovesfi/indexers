import { useDrizzleStorage } from "@apibara/plugin-drizzle";
import { Block, TransactionReceipt, Event } from "@apibara/starknet";
import { EventConfig, OnEvent } from "./config";
import { eventKey, processEvent } from "./common_transform";
import { standariseAddress } from ".";
import { num } from "starknet";
import * as schema from "../drizzle/schema";

function dnmmProcessor(event: Event) {
  const depositKey =
    "0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2"; // "Deposit"
  const withdrawKey =
    "0x17f87ab38a7f75a63dc465e10aadacecfca64c44ca774040b039bfb004e3367"; // "Withdraw"

  const key1 = standariseAddress(event.keys[0]);
  const type = key1 == standariseAddress(withdrawKey) ? "withdraw" : "deposit";
  const data = event.keys.slice(1).concat(event.data);

  if (type == "deposit") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[1]),
      assets: standariseAddress(data[2]),
      position_acc1_supply_shares: BigInt(data[4]).toString(),
      position_acc1_borrow_shares: BigInt(data[6]).toString(),
      position_acc2_supply_shares: BigInt(data[8]).toString(),
      position_acc2_borrow_shares: BigInt(data[10]).toString(),
      type: "deposit",
    };
  } else if (type == "withdraw") {
    return {
      sender: standariseAddress(data[0]),
      receiver: standariseAddress(data[1]),
      owner: standariseAddress(data[2]),
      assets: standariseAddress(data[3]),
      position_acc1_supply_shares: BigInt(data[5]).toString(),
      position_acc1_borrow_shares: BigInt(data[7]).toString(),
      position_acc2_supply_shares: BigInt(data[9]).toString(),
      position_acc2_borrow_shares: BigInt(data[11]).toString(),
      type: "withdraw",
    };
  } else {
    console.error(`Unknown type: ${type}`);
    throw new Error("strkfarm:deposit_withdraw:dnmm: unknown action type");
  }
}
