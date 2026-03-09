import "dotenv/config";
import { RpcProvider, Contract } from "starknet";
import { writeFileSync, readFileSync } from "fs";
import pLimit from "p-limit";

const CONTRACT_ADDRESS = "0x07023a5cadc8a5db80e4f0fde6b330cbd3c17bbbf9cb145cbabd7bd5e6fb7b0b";

interface Position {
  [key: string]: any;
}

interface PositionDescription {
  [key: string]: any;
}

interface UserHolding {
  user_address: string;
  position: Position;
  position_description: PositionDescription;
}

interface UserBalance {
  user_address: string;
  balance: string;
}

async function fetchAndStoreUserHoldings(userAddresses: string[] = []): Promise<void> {
  const rpcUrl = process.env.RPC_URL;
  
  if (!rpcUrl) {
    throw new Error("RPC_URL environment variable is required");
  }

  console.log(`[XSTRK Sensei] Initializing Starknet provider...`);
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  console.log(`[XSTRK Sensei] Fetching contract class at ${CONTRACT_ADDRESS}...`);
  const contractClass = await provider.getClassAt(CONTRACT_ADDRESS, 6064734);
  
  if (!contractClass.abi) {
    throw new Error("Contract ABI not found");
  }

  console.log(`[XSTRK Sensei] Creating contract instance...`);
  const contract = new Contract({abi: contractClass.abi, address: CONTRACT_ADDRESS, providerOrAccount: provider});

  console.log(`[XSTRK Sensei] Processing ${userAddresses.length} user addresses...`);
  
  // Create a limit function with max 10 concurrent operations
  const limit = pLimit(10);
  
  // Process all user addresses in parallel with concurrency limit
  const promises = userAddresses.map((userAddress, index) =>
    limit(async () => {
      console.log(`[XSTRK Sensei] Processing user ${index + 1}/${userAddresses.length}: ${userAddress}`);
      
      const MAX_RETRY = 5;
      let retry = 0;
      while (retry < MAX_RETRY) {
        try {
          // Call describe_position with token_id as user address
          const result: any = await contract.call('describe_position', [userAddress], {
            blockIdentifier: 6064734
          });
          
          const position = result['0'];
          const positionDescription = result['1'];      
          
          // Unpack all values from Position and PositionDescription
          // Since they're already unpacked by the Contract class, we can directly use them
          const holding: UserHolding = {
            user_address: userAddress,
            position: {
              acc1_supply_shares: position['acc1_supply_shares'].toString(),
              acc1_borrow_shares: position['acc1_borrow_shares'].toString(),
              acc2_supply_shares: position['acc2_supply_shares'].toString(),
              acc2_borrow_shares: position['acc2_borrow_shares'].toString(),
            },
            position_description: {
              estimated_size: positionDescription['estimated_size'].toString(),
              deposit1: positionDescription['deposit1'].toString(),
              borrow1: positionDescription['borrow1'].toString(),
              deposit2: positionDescription['deposit2'].toString(),
              borrow2: positionDescription['borrow2'].toString(),
            },
          };
          
          console.log(`[XSTRK Sensei] Successfully fetched data for ${userAddress}`);
          return holding;
        } catch (error: any) {
          console.error(
            `[XSTRK Sensei] [retry: ${retry}] Failed to fetch data for ${userAddress}:`,
            error?.message ?? error,
          );
          retry += 1;
          if (retry >= MAX_RETRY) {
            throw new Error(`Failed to fetch data for ${userAddress} after ${MAX_RETRY} retries`);
          }
          await new Promise((res) => setTimeout(res, 5000));
        }
      }
    })
  );
  
  // Wait for all promises to complete and collect results
  const holdings = (await Promise.all(promises)).filter((holding): holding is UserHolding => holding !== undefined);

  // Write to filesystem
  const outputPath = "xstrk_sensei_holdings.json";
  const outputData = JSON.stringify(holdings, null, 2);
  writeFileSync(outputPath, outputData, "utf-8");
  
  console.log(`[XSTRK Sensei] Stored ${holdings.length} holdings to ${outputPath}`);
  console.log(`[XSTRK Sensei] Completed fetching user holdings`);
}

function filterUsersByEstimatedSize(
  filePath: string = "xstrk_sensei_holdings.json",
  outputPath: string = "xstrk_sensei_holdings_filtered.json"
): UserHolding[] {
  console.log(`[XSTRK Sensei] Reading holdings from ${filePath}...`);
  
  const fileContent = readFileSync(filePath, "utf-8");
  const holdings: UserHolding[] = JSON.parse(fileContent);
  
  console.log(`[XSTRK Sensei] Loaded ${holdings.length} holdings from file`);
  
  const threshold = BigInt(10 ** 18);
  const filteredHoldings = holdings.filter((holding) => {
    const estimatedSize = BigInt(holding.position_description.estimated_size);
    return estimatedSize > threshold;
  });
  
  console.log(`[XSTRK Sensei] Filtered ${filteredHoldings.length} users with estimated_size > 10^18`);
  console.log(`[XSTRK Sensei] Filtered out ${holdings.length - filteredHoldings.length} users`);
  
  // Write filtered holdings to output file
  const outputData = JSON.stringify(filteredHoldings, null, 2);
  writeFileSync(outputPath, outputData, "utf-8");
  
  console.log(`[XSTRK Sensei] Saved ${filteredHoldings.length} filtered holdings to ${outputPath}`);
  
  return filteredHoldings;
}

function compareHoldingsFiles(
  filePath1: string = "xstrk_sensei_holdings_filtered.json",
  filePath2: string = "xstrk_sensei_holdings_filtered_cur.json"
): void {
  console.log(`[XSTRK Sensei] Comparing holdings files...`);
  console.log(`[XSTRK Sensei] File 1: ${filePath1}`);
  console.log(`[XSTRK Sensei] File 2: ${filePath2}`);
  
  const fileContent1 = readFileSync(filePath1, "utf-8");
  const fileContent2 = readFileSync(filePath2, "utf-8");
  
  const holdings1: UserHolding[] = JSON.parse(fileContent1);
  const holdings2: UserHolding[] = JSON.parse(fileContent2);
  
  console.log(`[XSTRK Sensei] Loaded ${holdings1.length} holdings from ${filePath1}`);
  console.log(`[XSTRK Sensei] Loaded ${holdings2.length} holdings from ${filePath2}`);
  
  // Create maps for quick lookup by user address
  const holdings1Map = new Map<string, UserHolding>();
  const holdings2Map = new Map<string, UserHolding>();
  
  holdings1.forEach((holding) => {
    holdings1Map.set(holding.user_address, holding);
  });
  
  holdings2.forEach((holding) => {
    holdings2Map.set(holding.user_address, holding);
  });
  
  const oneStrk = BigInt(10 ** 18);
  let errorCount = 0;
  
  // Compare all users from file 1
  holdings1Map.forEach((holding1, userAddress) => {
    const holding2 = holdings2Map.get(userAddress);
    
    if (!holding2) {
      console.error(
        `[XSTRK Sensei] ERROR: User ${userAddress} found in ${filePath1} but not in ${filePath2}`
      );
      errorCount += 1;
      return;
    }
    
    const estimatedSize1 = BigInt(holding1.position_description.estimated_size);
    const estimatedSize2 = BigInt(holding2.position_description.estimated_size);
    
    const diff = estimatedSize1 > estimatedSize2 
      ? estimatedSize1 - estimatedSize2 
      : estimatedSize2 - estimatedSize1;
    
    // Calculate percentage difference using the larger value as base
    const baseValue = estimatedSize1 > estimatedSize2 ? estimatedSize1 : estimatedSize2;
    const percentDiff = baseValue > 0n 
      ? (Number(diff) / Number(baseValue)) * 100 
      : 0;
    
    // Only log if percentage difference > 1%
    if (percentDiff > 1) {
      // Calculate difference in STRK (dividing by 10^18 and preserving decimals)
      const diffStrk = Number(diff) / Number(oneStrk);
      const size1Strk = Number(estimatedSize1) / Number(oneStrk);
      const size2Strk = Number(estimatedSize2) / Number(oneStrk);
      
      console.error(
        `[XSTRK Sensei] ERROR: User ${userAddress} has estimated_size difference of ${diffStrk.toFixed(18)} STRK ` +
        `(${percentDiff.toFixed(2)}% diff) ` +
        `(File 1: ${size1Strk.toFixed(18)} STRK, File 2: ${size2Strk.toFixed(18)} STRK)`
      );
      errorCount += 1;
    }
  });
  
  // Check for users in file 2 that don't exist in file 1
  holdings2Map.forEach((holding2, userAddress) => {
    if (!holdings1Map.has(userAddress)) {
      console.error(
        `[XSTRK Sensei] ERROR: User ${userAddress} found in ${filePath2} but not in ${filePath1}`
      );
      errorCount += 1;
    }
  });
  
  if (errorCount === 0) {
    console.log(`[XSTRK Sensei] Comparison completed: No differences found (threshold: > 1% difference)`);
  } else {
    console.log(`[XSTRK Sensei] Comparison completed: Found ${errorCount} error(s) with > 1% difference`);
  }
}

const TOKEN_ADDRESS = "0x046c7a54c82b1fe374353859f554a40b8bd31d3e30f742901579e7b57b1b5960";

async function fetchTokenBalancesForFilteredUsers(
  filteredUsersPath: string = "xstrk_sensei_holdings_filtered.json",
  outputPath: string = "hyper_xstrk_balances.json"
): Promise<void> {
  const rpcUrl = process.env.RPC_URL;
  
  if (!rpcUrl) {
    throw new Error("RPC_URL environment variable is required");
  }

  console.log(`[XSTRK Sensei] Reading filtered users from ${filteredUsersPath}...`);
  const fileContent = readFileSync(filteredUsersPath, "utf-8");
  const filteredHoldings: UserHolding[] = JSON.parse(fileContent);
  
  const userAddresses = filteredHoldings.map((holding) => holding.user_address);
  console.log(`[XSTRK Sensei] Found ${userAddresses.length} filtered users`);

  console.log(`[XSTRK Sensei] Initializing Starknet provider...`);
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  console.log(`[XSTRK Sensei] Fetching token contract class at ${TOKEN_ADDRESS}...`);
  const contractClass = await provider.getClassAt(TOKEN_ADDRESS);
  
  if (!contractClass.abi) {
    throw new Error("Token contract ABI not found");
  }

  console.log(`[XSTRK Sensei] Creating token contract instance...`);
  const tokenContract = new Contract({
    abi: contractClass.abi,
    address: TOKEN_ADDRESS,
    providerOrAccount: provider,
  });

  console.log(`[XSTRK Sensei] Fetching balances for ${userAddresses.length} users...`);
  
  // Create a limit function with max 10 concurrent operations
  const limit = pLimit(10);
  
  // Process all user addresses in parallel with concurrency limit
  const promises = userAddresses.map((userAddress, index) =>
    limit(async () => {
      console.log(`[XSTRK Sensei] Fetching balance for user ${index + 1}/${userAddresses.length}: ${userAddress}`);
      
      const MAX_RETRY = 5;
      let retry = 0;
      while (retry < MAX_RETRY) {
        try {
          const balance = await tokenContract.balanceOf(userAddress);
          const balanceString = balance.toString();
          
          console.log(`[XSTRK Sensei] Successfully fetched balance for ${userAddress}: ${balanceString}`);
          return {
            user_address: userAddress,
            balance: balanceString,
          } as UserBalance;
        } catch (error: any) {
          console.error(
            `[XSTRK Sensei] [retry: ${retry}] Failed to fetch balance for ${userAddress}:`,
            error?.message ?? error,
          );
          retry += 1;
          if (retry >= MAX_RETRY) {
            throw new Error(`Failed to fetch balance for ${userAddress} after ${MAX_RETRY} retries`);
          }
          await new Promise((res) => setTimeout(res, 5000));
        }
      }
    })
  );
  
  // Wait for all promises to complete and collect results
  const balances = (await Promise.all(promises)).filter(
    (balance): balance is UserBalance => balance !== undefined
  );

  // Write balances to filesystem
  const outputData = JSON.stringify(balances, null, 2);
  writeFileSync(outputPath, outputData, "utf-8");
  
  console.log(`[XSTRK Sensei] Stored ${balances.length} balances to ${outputPath}`);
  console.log(`[XSTRK Sensei] Completed fetching token balances`);
}

async function main() {
  // Empty array of user addresses as specified
  const userAddresses: string[] = ["0x3bab9178bf73d9d7bbe277ab9e2917f74b9964d434af0959aef19136036649b","0x72a0f27fbb2bd6857789641fa1095f64c86571919b16110b58b38a9fa604dab","0x465740162ad2b7b26bc3bab0aa40fa0bb6aa7c5801eb052444c0f048c20158f","0x533a48543598e35c0e269eb52b37c65a4f698b5e16b24fcbd7e364875594ca1","0xd9b4125424686edde1e07736e5b6472f0e36966721f73b4c5da91a3de8f7b4","0x12d6f7baa540d6ce4e879723457360fa913bd302806792b5fb699615a7c7b57","0x780fd42f0237b143d8991946a6da6d3b06b9bfb6569d4cb342a69f4c6aa1bd1","0x41d5010b03a3e68dc30eae89e8a6eaabc871b73c981d8d90de4d3d8cee35e2a","0x75ef1ec82283d2d9419bc6204e7ce851f5abf592160b54d8003969a211f9108","0x367000a411f9b7f53fec24afbb986ac98ffece1dc5085877f78436dc04cb2a8","0x79dac5183e5bcb53f429f6d102d6c7c8ba67b24c4a512f7eb3f8787dfdf23c6","0x6e5911753838814be86f3ca61c1b7332d9e675d8ff79a95ec9e3013f9cbd61f","0x1a70fc475ec39e03b613a1e34ba01883f4440b831c49cb7d263ecc77874b9b6","0x457d127ee406f13e3a3eb6bcd4b0e80669448aec50340738e33377e1f5a6ce5","0x7d6064c2935598789376d3b03250536398274b0201e397cdf914e762ac077f4","0x1052e7b9c2838f8b36bc02f68fa718ace541b0a880cfb6b36d3aecd968fa0cc","0x5bff2106ac7c35770d5452b122a93cfc79570ce0aaf5fa5b42246360ace5c4e","0x14c4bc933398da9edfb8f0715e628fceb37a113b334e7f3d76a969909226ad1","0xb0dce586298d4a7bd87da0d31aec94ac32f7c48bac3568bbfff5203dd74899","0x5a4945e80e5cb3ca4a2f018f2d680ae3be96ac2743bfe06d24947dc52e0f5f5","0x7348d8dfae3da21bd774aea611610cf3553c3d9207f682d491344cd4df2d3a2","0x1f679be0c08b1257b586a05ac01636356862c106ed33efa166dd0fbd7840057","0x37934bc6a0a10f33c80537a0e58f0e13ef931187f1ccc489a1f490c41a2b868","0x7133833c96a7e039603fc3c9836cf9c49238407cb218aad45044a9ed3d8bafc","0x46f9796b96a38b12da45609c4f72a4f225acfdf739fa737e6e79e9cab608873","0x29fed99bbd144af044d42c6166da4feeec087eb5035deb0674e72d8ccfe2b4b","0x27990cacb447ffc4089f9f0d6a9a4c04ac715c6df5325f0286687aecba69a63","0x1cf75e3911399b4e6cb0208be6e837a933daa6a0ffaa821404e2dc96af78bbd","0x774ab31a08266c630e804c6e0663d7378c879b88ecf573b5640de9f4a8d110d","0x480d722aeb48c7ba08a6db65559411d027512ca63807030aeece66ed80605ca","0xdd1d517ed5f74bfd82726d59337ca7b14e729ad7b563684f12f12b23f91795","0x58298ac7408620b6fe67938858cb098579ae22ea351f7ad9a0dc1096c5c34a7","0xa1c7f3f37ff970604dc214be36fe302b10a4567c3ccd8771305b69b642b84f","0x5a36e764bf6eb88097c3cf3530c017ac7b7d497a9dd82061bf82d04ed7ca6fa","0x55741fd3ec832f7b9500e24a885b8729f213357be4a8e209c4bca1f3b909ae","0x25fa26abc179f5bae522fe78101045c8c7546fc2fa47da8384e27870dbf5b88","0x6c1dc8cbffdb847cb3e6a0ce87417deccb3012f4d7020a834d6e46f9ec31417","0x745fdc0f30b524061f061bf70ab2f4a208cc65c8fbf6ceec61c6f8ad6a7697d","0x691ad8245039a9dcb4ea1553cec67bf6560bf00d664eb8bf385cf96b95bbdbe","0x36ae16fc32445244bb263871c330874fe3e20c167752160033f54352225db32","0x7ea5a5c6f4926cd186710c2ca5bf9876990e4fb3f0da2e1ff7f365f0b1f6fe3","0x2feff53d7fe574d76bc4ae3bc88ccc81d253f360cd30408f7e1e16c3872dda8","0x2e868d70a057ecf97b368709a8bda2a4feb85dc7bc74d0a510b0e35a31f1fab","0x7653d819a531a8633cccd9ccd62bb3472b195a8eeee2fe38980fca9ccfcfc3c","0x13432f922e6481e83ce204d47820315c3d9f0696caf27320173d1722f6797aa","0x661921c97e6b44817eab097c530e98f36b286c61e65e0dc515c09205630f8c8","0x1ecd8e8ef5560066c885f0122fabcbf12ae5627732428206a24aa64f709743c","0x75ced90c16964bddf85428a8df1b5e16fc638bea918759281b3d96f7b37998","0x32ea3b924596ee6fd4b8558e2550f7d8ebf43437e3ffdc75098a48b78338ff7","0x6bb8f5e373b2fc93c0c2f44291d37aba85138597fa10bac6a200e9b4c7f5a1a","0x7eb6f6a6dc758cb81ecc84264bd874b65944b5cdfe5ef855afb69010d48c793","0x2e5ca73aab554e15b07f5d4f9b85632dd5fea42a957f05ef15ce9a771307a9","0x7e11e20fa4ec6d7ba422955f47ebe05c129d88b9a5dbb686caa5332f943c9b8","0x11f5fc2a92ac03434a7937fe982f5e5293b65ad438a989c5b78fb8f04a12016","0xd3a243544a12e3d8c4dcc2a58bf97cb5b934aa59717907f0aac1180351193a","0x39f0f4d07ac548f79c038234192970a7af2d8b47f682abd992828e2878cf05b","0x4f871856997c22b6a14eeba225e555ae44c41ea44ebb1ec80c7d75efc7aa883","0x1cf04f3dc50f543dab5e49f5b938e869bebd37438780cc429d8b9522a12efdc","0x36177b6741a43c219602ce857c18e445920d5a6ea5f4ee3a0240e8ae319bbf5","0x69efe115c522d2764a066f5df80c0ea0a0444ace1b9bca04397c713761a57c3","0x1606059a74a08bdb7fcb7c047f5727fe89c788a72a853e45707d5188cbc78a7","0x1dc18294ec8d0b13dc38f0ee0c429cfb153f327de8db25549dbadd3a6677786","0x1a889cbf6065c0c544c12059b5b8b645b74af43f64c3b784d1ab6ee5ca9a31c","0x779f470416b5e6f22bd90c346ee6c90f8926bc70f95ab7b45e698a24dfaf5b3","0x4cdfffb674668b7348e39e469cbf91f64279576d910220485cb70e60bc78bba","0x27a9e66e3de8fd7d2a7bab5df8c68c9d456b23adedc2175e767db7b1dee5d47","0x189c61d19b102bf4bc0ba58614d98261580c13da3bf7d302a4693affbee67f6","0x968aa1d9123819a71a5767715bda317e5747491da56a9a7e317ededa94db4e","0x583fe671eb701906f6e61ec4b178e6d8c7901f4fe9d4e4c821d65b9e117d810","0x2f633885a70b888b7b1be60df9a7d60afc22a3d06469654bdcc63e4aeb8eca2","0x664a104cff92ed8ac18b1dfb5f43cec901feb2b02ebd5b11b608910d2d67147","0x269cb810bc22316f8e6a53d164398e83f8255f7e980621f6083e5f7bad74fa0","0x7f8dc9cf8de98cbac1b37e2a79b75ec3f5a125079ce9daf3d6d3f9a7d2dd1f8","0x780100f34c2336ef580a17256198167229675e23cf5cf48fbed42ebe0f5961f","0x1590de6c36cbc1158017741af849d308dbd0faf16d2171113b9a4fe49e4b613","0x187903c952d3b4d6bc751ca0b7f5e75c5973902935d84985ba8e2ba6c83d134","0xa38e6c93cd46a964d41c39887fc4ea9a0db2211d798d82c3d91652f1d1a131","0x5f7173d900618518b08de724c53ac05a089dff4c80e868c7c0658658e9a8e91","0x62913b51c52fff8d0295205e5d2aeb5b70fe3ec4597e7936366df9ece9f8666","0xa0ac4b07ed21b13f7cc952dafed8bc2e21a74cb6d2a7eea19b4f59e3bfd90c","0x7ad60dd5544e0585f15f14c8578823749386387f7100b858202372270dda2a6","0x77e989f75ca0bccf5c5b20b25d5ea754c96a1978c1f3cdb0b2152ef4be55ef1","0x23f71f86c88ca3befffd2def8ac14b9919ef2f123eaf2a280121513a83287bb","0xd5ad9c35199c640cc9867afebe96f1e0bbeb85adaf38b9e584bde7cbad7ee8","0x7fb2eaa6d50e56d6afdbc23b1313285cc159223168ea3e48e20344d38c482c8","0x783be7bcff9180f10c82148e9f51d5faaf7c38f4152b6d55015ba9497d49499","0x2cb43bfc247206e4680647024ebf286b20ce44465f02938b46af7d390ae88d0","0x424ec6c0d9c74141ee4f59f8a5f1cb73a345814b8e9e6953408d2fdfcbace8c","0x1a1865109fb8c0e11309b59977185b40f45d6947a68c6d61cd52e0d3f70bdf4","0x58c3b68eca2a0fc4f6a105e20524d662878d73bee91b73efb42c055c1df0476","0x64c18c6cf64378194be9ae880cc6589cc97c5d2ca4296725a312426117fc0e5","0x52ac6f414c6ae4cb53e73e285af03a4b270aec9191fae9d7e50ff0573c12","0x3d700d3c9ec93ee6b8e525a6faabec6e25f3c07dd3bb0c0b09f8df930223fdd","0x746d952482f38cfbc7b0b15c84838ed037d58cee9e98741ef4efd4d73b6e8cc","0x3bc58de8e099340d1d460f1c19f6088b201e3a68afff846552bb9d76652ce1b","0x3927e24642cdb16d6995482e56f6c98cfb7fd8f9dab6701020879b126bc6419","0x223715c943925b7e4d338c5c014770ccf6b710d987072b67b3d6fccafad894","0xdc0e9db2dc0634029f1381dbaea8b45aea9089c880acc346c546df521a1fbf","0x5db399aefebe4a098fc60423953bec4ac704189faa1d6c3ce1bb2fe4d424bbf","0x640822d69e5c3e6ecb549de81d95bae4ccee96a4b8b3fa61932d2f3ebcdce8d","0x3cc66a2689b84c2f41fe7a2c8230ce95eb33e6edcafbb80a1141cf375b42571","0x2288e57b7c29cb7977937da1b3555caefa2cc10658077c74ae156cbcd8a6a80","0x5437ecd6c7c82040fb956f68f3bc7f81a02a6a2ace0431e8756209762e6e052","0x43f5a1f13868386d49d4921f97ff41ea0d8f7dff51cbcc9e2a1b922d436648a","0x280e0533b4816ceefe0f5120278eb898156065d1efa98ea9d6091c9b1da0aa8","0x1a095a6d5093b53b8ba8a5956730bfe2459fb65e1482cb2014c3941d38a9c51","0x3ee1462f41e7f94e47114bddd621d2d1a3688bf1d83f4535c67c409029e6bf9","0x47af1a14fc7e7f7d59f53a7477ef679c0abdf918ec402edd2f7a43506ba3b0a","0x50393e851e40de930abcd9569d9df55883b9f2836d4bae724f126d2258cd292","0x3985bacc7032c30acd2696d313452417bd82ee8be21bb5cf0e76cd5dd95cda","0x52ecea541653be79661d380df38b0c97f9b0ef7c7467ec02d3ee597e84ba01","0x5aed32c092b4d597e524160d749c4ac4bfe38960693b79f3c407e9fdf6ec7f4","0x1ae4192250a4f6660778a2b1ae79c374e103871525371f4bf3957a606c64fe8","0x6e5ed38a6ed605fd0c09dda9bad759ac9ea2c9e9348a6fbb6e28c0ae422104a","0x60c398d0eeffb3d40334c24aace91b2615af6553980dcee9509c389497e1aff","0x4e1ba9349ea42d70a63438951d3eea1f1107942a917c372e19481177b203714","0x1fb5483b9f8c6eda957b987bacb8a6ad3f1564c9b35d76304e94743127efce2","0x29089432bd0553fe9ea4f7f490dc2323a28840ea0e43c56e280c16a2fed789f","0x220490583ae9bf3203ee47cf386460e2a97c910a2ab59b1ade5798cb5fb6259","0x1346201d4600e9cda54dfabbf27c56bd6a6f2aad7f452f80b78dc6952d94b26","0x5e902e6abefa8094a229ced0841671434e63e019e26a64db65d7d7b66eeb2fa","0x4ebbd05938003dec38e45f387a45b82b7a9062282a555dccdfdd5a5c949c577","0x721c3ac5ef0e6627fe20f096e09323b57491da3017f0be71cffd33124ee418d","0x7593e339c8bb8f34e6f26cb68c723520e916b9fa45d238d923ced1e1c7fda21","0x601a62b524de67eac620564458e034f5e9b1a656c15aca0afe04813156371af","0x20fb29b9912f94ce2c1066e10a6543c9533eac9047383ea3c2b36a607aaae49","0x511daa312e621f3efc9a3cb38003a243513a2faefdd3e359cadbb947482307c","0x4ebc71b960470f1a63c1a43e06f3eb99e72b3b4fc0c8b89fc943d2b08d00613","0x15cacc2a26a8b03b415b916d5ea4a3bd0a2baecfa6b40d89231aff0b6b1fe3d","0x3cbb4c53c5a87257d5b3fb27a9ee47d137aad68c45a33bdc30d3bae1b94f62","0x4797c09a84d731162011dcab1db1af668ba4256ddf4afbb235b4290e1cf4168","0x770961e79f010695f114277a2b1885b1c41e72267225c6452a89bfbf20e62df","0x1f3fc9af4988c91637f4ac17663fc486227162a1cef629ea6b5b318f28c3046","0x6c8b87e3b03fae43f3a599b677d521db2b8bd1671516cb9246ace3c7f27aa54","0x5b4be97e2351ad92dcddc11cebf172d61b9258ba496868c70d5212ac13da2cd",
    "0x5ebbbb89aee5070dd06b6093510df5c615187a97ba88f474a182b1765bebac0","0x47304606d2ffeddcc0bf4943f32f9af46ff8659355ca37721d8d17db2157882","0x57477809591302709f329b3db0ea70a46a6bac008917c0156ef14b75eebf52a","0x1d2907a95499c818302e4799045137404ab0583aa4c220829ff86d3fdf6ab03","0x75a668da01b1444dfce42726e0eca9eff5a45513bde8c583d92b7459be07752","0x3d583566ebf0789367485fc94008b5fcba63eda2962c35ef609a7723a7f232c","0x656594466884a948cadef4919ab631e57cbd12b44cc8470de31276c52f75f20","0x3b04a363857122854043c196868e452f13562670f6abca159eb5e040d93b7b","0x3641b4c4fa7989ec86442fb38103967ba742e864421ea0eca0dae75c5891b3d","0x255febb33314af5f536f32d4df63834c60b1b0d3c556b53f460e006230dbb64","0x619f9887e05db82a8e0711ad407db720ed3a9a83b8983e887ffa67ece81aca6","0x479d4705a8ea1b533cc0222415a9046df663de525bd66fbf566e51a32fd97b7","0x79ed472a3bf24fc3d6c740791191f30f8157a0d1dfcbb3d292fdde19f709039","0x407491e7c9c0144e3776013532fe2ae3c8bf28a8f303f499411d75e1e3628cc","0x46071e40ab9cdd942300442c12f9277b6835cc2a533836c881d9b36a8b5df30","0x456699b5b12af6a117d253ee1c3a8ef4340964499dbfbbb919cb7a4705bfb63","0x75bb2b03e3243077dc0ef64b6a78a06c6f7e7c18444a5f7d6bb68c07d385155","0x62752d04ce52e4c6331a42088fddc4c01aa18df27ee73837e621202ced86e5d","0x116b0e10d5465301bf87355f70f13f524d1679d33b3980741ef1ba47e8be965","0x7abc32cca696dd5b140011a02fa92ed54f4b8d0dc61ae2f2000a35fc6c6db67","0x7f1dacfeb345925aaa56d864cb19908009e606319cf49e9e769b514eb5129cd","0x38017f526a9fa5fbc1103fbe785e7c219dfc9ddff7ed61b3dc718caad8794ce","0x2354dfadc961079c9c84c1ffc2e680e602f13bb8ed694f41156beecec35ca38","0x323d281487ba90ef4c9d7f53f8bda52fc7b2db5c6f43a0ec67aa4dfbe427a28","0x5e1fbc78ed8cf70f2beb53b4eed1ecb40de3838cf6e741a1c52cb57ad0c433a","0x1f47c2a0bb57593d13c5f01ab781e073700a6bfc85aad235a7c9c010ab4dd9","0x5f821705e1da9b42a1431a239ac132125bed45f3470777e51e26f0626450e6d","0x3faa3a949211db53991e8d51de063d36eea2ce5d1f199dcf97178f85380f834","0x411e8f0da11019e947dfa017096f28cee04497e10f3543cf475b2b250ee3884","0x27ee383790ec41e778bb317c05248a4ba8ea575736ffdc12f49951006f57db2","0x34bf51ae255804472abd57c56b1e36ab7e4f86e8f0c3e3f8d021ab43b9568e2","0x76d03040d437ad18d56eb9b4915664fba636124045057b3fca67b604efb54f9","0x1d82517e7108b0ab73da2010f96b75841a60b192fa8db3dfec89f0fe82b1882","0x18a66de97757be7c7d9259f401cf0722def7bc709efd362cb4b8c14473d6c8c","0x11fa229ed4aac827c7baee1cd120ec4b3e162a84042d6a6b037b45edc58ae6b","0x4b3adfe3212ae24c7a7eec9c42dc6e605fc80ac5dd35c5c138242c05d49db19","0x40d77c4f29d77186687d4f8c26c33237deab0bcf70ae37d8e8ccb9b371750df","0x211b54c273eda0c9d8273d398d40681cb43c27a995b08da658c32a68b9875b4","0x7dd09a19141d645a396ebc2ff708fbe9774fcd045148cfc2a0a71b345ef5dc0","0x43ad89f5d387097bd05775677e55f45976ff2d5c14eae153a0cb706e4f03944","0x7f3dd1b71b2e50226b9f0914afc38683c091b714d3ab55001f3d19204de67e","0x7537896c97ce805b3aa80c2d61e5f1381ac152291eaee7980fa60f0022e11d0","0x1ae9c83076d5cc2990c121378a42a12682bdaaf0d042988113256213d578bb8","0x26a4aa9c14c1a532438c54786a8c62b95f9bfc844c3d21c77afa227ecb32eb","0x2e48df8e04fc000d43ab4ffc8f4a908b50a6aa550758d76267718d7cdccbca1","0x49f8fc20a9f1950b62f9d978b7acd24b197f1f6f923d3b6abf3da782ca64bc0","0x676b4572d3f9350111b02dc475d67277ae14e03c69a4790892ffae65da45ae0","0x7f12ddca068d1d36a5546394024024df9ce2d260025f1af55f0c0d31ec2f365","0x1cf81ddda091216cfd6f412efecd2a24d9747bb94680ff45a5e2690868fe0f7","0x174a395b1f525eb9cb56262fd162b556354445b1f7b6192ed573fc7c28202b9","0x1d92c4455b206e705aa27b6fc156c681b8aec6381a604ac63b574626abce575","0x2cf3e183c81d9623a49afbd61eccec964a6ec652006367b3dbb992d4dd79906","0x51a20d2fd7841a35068c130fadf9290d695171204fc5e1f5c2193a029d6de32","0x51d718e226ab5d22f25baeb820bc596e28c20b5544168e0c5bd2cbf385f8d48","0x12ca36c21308f4e9e9c22e8b251b0984e3561d8cadded2ebeece4dbcaf57763","0x14ea74a1193083e556f5c43b11a72f607cabfeb647afb8beef2dd9a545d10ad","0x5095078578a59f8a9c17df97188db1b59574c6d4836dd3e705fe8537624228a","0x3fb974c9deaa59b177523a31f6c17c228506a2bfe34d55a794d1415d816737e","0x578cd02604f7eabe732c4c77cd31dbd90834b20e58bf791eab295b5e596f4cf","0x639e0040af0b33b2c5d6343483928ce590cdc3eae686c8f57fe9610c077c80c","0x6bcfc16a27d3169fd0ee0412285ea2d3e249b56e129617cc63cec0938838dde","0x13d8b17669ef26cc68fbe5122e3e6eb7231776c8d4c3e6af82979f817efbc5","0x819310a3bbafb23a122507bc756c78155079d5c5f2d774eda94bf63d3b22ba","0x7ff5f98a1858472cf3cd2c6822d983f263cc7bb929342680e434cec717ace65","0x6ed519c41626a1957910f3a9bfefde227463d6f675d6b2fbc7dfcba49b8eba2","0x880d25ea6ec1a331dcaccd64161ed0cf00b8a9ac814bb00eb5635a38d5e20","0x253754d7bf61b52c10876caa4a8d6ff72e0e554918029eed71a364388dddb45","0x5bc04e39ce43ebf4ea40cbac8b8c4ca517bb597ed8f7b1e0d5d14c9ecbb93a6","0x5adf5398326f6fdbda96d30fb263cc5d502a27ddc2c5f91fe8e5a496fe35130","0x19b7b9deb388b019dbaa639fe02da85cc0fe8f14daff846fb27034b3ebe836b","0xf2a81d3695e142daf18caa58c6c2eb43bb9f0061db43d4048763a86927717d","0x3878323dacd1af962c285c58bd5d846ec61b1b76065edff724fd300390491dc","0x1f0f2397f395f1a1cd5dccd077a8b97f9bf8540b5d0c15f0b751ef238254010","0x38517c12ccc681a665aaf39dcc8d5655cd21217fce1bf73e18eb0ccc451b1e6","0x6c9fe5343f0b4e57f4829b01340ab7ccfa396bcabcbbeeeaabf43cd5c252d5c","0x3f72b78db1713cb36af4fd3f83cb169fb3f8a51f23d1b4e56ddc8edab5c23a6","0x762d09786538984dce0bba90086a65598becadc53b7a04ac99915e8c87205d2","0x2de8b05fc2edc2886889ffb7232add3f0ebc37ce57b40b3efa88a7b703809cd","0x75e5a36a3509f6a92b4aa50119a9ee6a15846d46fa6d624a17bdacabcfd14b6","0x696531683c153bc51fe9676a638d6c732a380e1631b43881ac5d5bd3fbdd94c","0x4b8ab6e9716bf9b0a9917cd16189aaa58751b570781a4e4d5c03f92aa9a9b4c","0x720eba8edea43289347d8cc5518a1944b3eb5c9bde8f255c4946f9ff21d782d","0x113686f6c9ed00bb4d93ef4cf26ed3c64d3358bde2162a7af250d5567a4a04d","0x6571cb8bb766e09f4f6d2911e1bc160fb29d8fd722bd377acfa918e29ad5e44","0x2eced80e85a77d078a236782a34d6b33af8e9ed4a1fcb4c3724fc1fded959d9","0x5c3ebd0a5a07c7d3a2cb233549f496bb94b3a550fe4f45afe645c3b70f2b974","0x727c16c82d0b5ea743e244f4b7d9f4bc0f0e14b37cb86052d8dc4cbe1ce781","0x61801cc224fd4975dbeb2cab43ea73a395edd46148135d6d13ecda247df7674","0x62dbe1770311da827ab3aab63aacaf4cb2f78db4eb9904ca33e906615d98ad3","0x24474042fee5575142255bd91d87f11ec3d9c1691bda8eb72b0348f35e17551","0xe7bee27cb3ab10eba64e22054c052fa130267012abf824bb3adf38e1239c08","0x47b189458090796aa635321d7f1b6aed0d25fb700056017b18c4391233916bc","0x7555660007185d62eea39aa73daf46c89dc3aad9367f8756f43a4548d0ef8c9","0x3b9dfaaef91f6cc00e2e4d4fa8dfcc45e324f0ce9b1c07e0a60887b20d54b66","0x5b74bdae958286e7d8f80b00c5fbedf23632d56165e302d0579fc292d97f798","0x11b6e878cc575025b488b2e7af5f58f9df99b9f9aa03f22f932ae0b69a955f1","0x403effc7c53939e3df1bd86d2d7471660b1fd37a6a4186cee1644666d555c6d","0xe498d1cb9b856a18cecfb23cbff42d0d3faf344c62f9c1987af43022544e2","0x60282833ca4dfa3314dd17ace96cc1499b59c60c42adfb018d555cdac6e9302","0x7549aea14f36d80ed958fffd9e28827354ddd7b4c8bd55fc17d7ca338ee58da","0x1692ed4bc552b1883441de5f1d8a72f5c6bb12e3b26c77e397ef2127e9f5384","0x343a64a6a42a3abc15674f0faafda810d4803b74068a3a550fbcf53801acce9","0x14fc177e2698f94a31c630b02075cb8d7a41768cc77953a503d95cf5d7d1e0c","0x7010229bedcb7ffc91035fec1c6ec2a6a351a65bb22903102221011402fa0b4","0x3e04680b9b89b9156340e35c0ed1f862d5fdbb77a7819e01240d9f83e1f8037","0x3495dd1e4838aa06666aac236036d86e81a6553e222fc02e70c2cbc0062e8d0","0xd8b7ed486754007752d71787ffe26e38213b8c399c9dcf770f6f41142705e9","0x13269278ab71e9a1f8716e3162a42f43214072e9ad24d0688393d41c863853e","0x4b6c0d179d7b8fb369afa4ad3d8d8e75a031e621319ca93326b27cbea82fd46","0x51bccad6e39cad4e3eb5140d31ab9c02c46b33d9a069e7525784a17ba9130a4","0x6c7251de1c6fcf9130ca27ba197b7e0cd2f70e445867bfb544ffcf71baf43c7","0x4001bdad3fbdfc8ec970fbeec0b4e618ade42d08926d3574d53fd54368bf303","0x7bf229579a57d50d6b96e208b31ba22c38dca9e5886b4517e924164151ffed5","0x5c57424b1220f510fb9f477e4eaa782d6dad1289badacb51102ad770cb05f8c","0x11eb3da9d926d25aa56edb8f30320c85f33579216400f27aff3cc996530da6c","0x3673896fea01a347fdd7cbfda774065f28bc7afe0aab55e72a5916ba12cb2b0","0x5d40e5b3c1b1867a2ccbcafb92a2b8276e4abb1df94d979227f84e25367bb29","0x27bc05c8205bded50c63ebc794bf90b55478ed3e915a4e9c37d1508a6328a32","0x615f233d56d5ba467f4993c825b47877a8c423ab19125c752036cb147219e1","0x612ef5b8649adf82e746d5e19930945ccc04ace0eb34587c5418016ea56fd37","0x4076082b41f945e6c836fa87a6f423c693fda55eeeee2b8143f1e68544656c3","0x4867bf85fb527e24fef7f5dc7255da89d2ad33db27315ffcc2b7aa321c11723","0xac71bcf9dea0c5cd1e5ea1a9cc6425b20540b9b17449ee6c433e67ff5100f4","0x1a6f32b5d81ae1daf39c914f072a3aa1cddac7434b1491f4237b88fffad329","0x1bf12fafd393f8f1eae83366f34943f216f042622e9e8e235a5111c1eb37642","0x1809239fed9d52350b8468741537963a0c70804084994e3dc28ca2ddaf52275","0x1d6abf4f5963082fc6c44d858ac2e89434406ed682fb63155d146c5d69c22d6","0x7a0fffe1d527e0af1a8805bfc75cc958ef72de0940588e64612828ee969a7ee","0x1d061604b3ca8dd6ebcaac9f89c5ddd771865f944b1a3dc54f0360d93e9c53d","0x167687f4c15af07ffe7c4fc0029b5cb24ca7207e0f92e4386261d0a2d67ce14","0x2f829cb79c0ad34a16d3dbfcb9e328317eaa74e42d9da8ff152ef171f0a0827","0x6909547257f9dee8999a9e7067d3afe2f716364f7edf603c75e5a6437107986","0x382edaa4cd44977af7893cfab427e2231fb23341dd17bcaf3b62cdab554b5a4","0x65b3d3e0368f2bf69a9fa5021a57c780cdc8e9eda5134ee41d96a520a7ee9f7","0x5970da1011e2f8dc15bc12fc1b0eb8e382300a334de06ad17d1404384b168e4",
    "0x22349c4751b41782d0a29fefad990f4168c64d29218385b3e39ec81c6df3cb4","0x3a4e08a629315fba6f5400d7e28cdc00adb600846311bc6d59b31570906a21","0x73fc02100bb27c478a8d1ca0c73ba575ab166646b528e54e2f558e2019b71f0","0x459eefd165808ddb9ae107f1698fa9fa193ebf0894b496ab9f2754a32a0bd01","0x735c01773d25a2b2292ab1c81d5246eb5c02ca2948230ecb386be451e49ed79","0x12ef68c3dd74994ea548cbe29def0335602dc40a752f66beaf18d769e2ff8d0","0x64c7186243367cad04e501ffed54e952378fe3cbe5890e07b49160dd4d5f760","0x64d6cabaa4c0a49b046ba7666052f969f612f6e77756086f55acc3aad224fc9","0x6b600a2d9cd60d59f320a5cdc60d73e2c4eca6a5c512db945edef40497268e1","0x75875c48f9e8349c5fed2163b04be04f38590a3e9c1e87cc434eafab603dead","0x2d2fbea7620246e30e3a3f47ea35b6b80b73789b0767e1f776e012a6b2c651d","0x24fc72c575735746e1ccf59f0b73c7193abcb0f94270efb1cb9f6cc268ce583","0x163199c00751d0a6722854db3dce5bb79bccea7d942b9ef4103dce1799dd8f","0x2c30c7591a024a6c42ffca1d1303b30e48f00e58eb7b314311b2457108bce11","0x1a2c58dec5bc7441ac4836f87f732267f01d9043c81fe6485485b649aa30241","0x5d97a3d593e7607cbf19bd041e7b8b5957baeff089a8042f29319aa832af7d4","0x30bc1cd112a8efb45a8824a17e6d802e50bf3f516766c606d0ee0463fc8554f","0x22fd5b3344f6c55f49a8f26afee1c4c9722fb484f6511d00c63c3e43cd981ae","0x5183b119dcb6cd539007b00459aaf8cf6a5a85b6b56df50565ad6e3ba4730d1","0x51df0f4e04a9414490fee5298bd01eaba91395284180855f221c4ea47bc3129","0x27ac29ec732220415b7fc9b65d427722acc95dc963a53d34ba9fde363c1605f","0x72cd5387e2a18a9960f1d57439c33a5b1e1e4b6052e4c6c9f942155ed1f780a","0x25dbe00cbb0e33a9ee02bd0ceeeb1172408bc53b14ad7a1c7041770bf24b99e","0x672753ebb9f27d231aab0a736f7561f734072df7684e86f1309f9a38afd23cc","0x5c943ef6e4524b85056adebf82e3593a8afd64169b11f4bf64ab342ece973df","0x2f57b48b8f886ffec150e46f6697828d02586fd92163e8ba1ae09279ff2b6a7","0x5ceac28a7a264e3b300075db1c79678bd4bee3c058c12a998a97078db7ff47e","0x1772089e244629def15e6e606a93ac4849ebdd82bf234ea80af60b07dc25fa7","0x1f45659ee10f4d1d1c5c250e7113dea31b58c129c3c6057eebb45207e15b31f","0x401f3a0e7822033a337450aac7aff3c8097e5e9a36bfcfa5ea2aa4fbce4d91e","0x6ad3bae32581efbbe051fd11fdf79b49c140930f1735b33be885f7fa6a4edf9","0x390094f7f1c3effef32a29a83f4c92ebd9e7f10bd7e4b2ca5d23579aa8a5c77","0x718505b87b5a448205ae22ac84a21b9e568b532ed95285c4c03973f8b1a73e8","0x7b2cb7e2c8d68bc76300ad576d3e090525a7bce6b418661754820f503d6c6de","0x1336284f1982b088593e89f51e917ce561a4218011a24263b74dc4e44ebc5f5","0x163bc4e8f320ef26677318a074599750ae5f7a12252e08d58b83abd818a4cf7","0x5f2681ea0872b5d7da5702f79e4ea4ced032589e195e73bf11690057bc121db","0x6970b2285f411dadd78992e2fd4f75daf0814f5705dfaa05caf611a00fbb7b3","0x39e069487c9de418450bf33f736bc3ad4c49e7637fd1365ea83d2b47c9ceca3","0x25d55e2649386f2f3a23de68b0cacd91af7e04e1767541e8a4626fafae8e84f","0x71698aded75e19575d236db9b577eecd197351c36da40f96c74a4c816e130b7","0xaf661dc003d28358a600758da940634dff4c7ef2220e7dd418ca8dac5c102f","0x5aa222b5e961a94f9b250ea88b76ba00bd878dd1104592af50b01cabff1e8df","0x44e66ed4e357434076476feb53285c2bbaf9386e760d06e48954a3009043702","0x4442f329e96b9538bb9634b741e698c329cec7c0b09937305fccf1746372ad1","0x64605a16d36e399bdcb3d8939f24f860d2a9217ca172325a073c10902ebd9e0","0x729ea330792a6f51a1c810327dc9b936121a802381cd16b4307e8efb6e5faf9","0x972d051a42c7de2e34487c0dbb28e31c9426945b7af1b7cbc09763419a8c36","0x2de433be73f30a6fb5ac19cea8746dcd25906033edab1b7c5b1d372cb32e86f","0x3d91d68eb394595fc110c9ab78695991e254deb49ad386a38d31d329f12955e","0xbf7ba278658bb8ddb076939d0d10b96323177a594792285516b2d7b72f9899","0x6f0ccb08022aecf570d4a0eec5f52d92397cce59d84cb8a65ee3adba46d674d","0x4e46ae86b088b48ee3e26f8d83c7d6f339f0ebbcb691fc625b2c697f3c798cf","0x4cc75305388cb4d59eb850f243f488ff20f41889bc224ea0d97d963ae94ea09","0x46d703df4dd4e1b8196b294ec295c8c66097836cd4085372299ac53dff5d478","0x45d5c8640f0eb9d0c1408ba43e61be9aa0e688c79ca5ed4243de4b6a9b76ae0","0xd07bfb425cb42d3d7b6b954300bcd358fcc62951919b81bf0599642ae925ad","0x25cbdf6ad9bd1d33f14d7abe60413dbcbc1ea1643faae0baed39178f0ef1385","0x1f3cadf33bbc08fc19a5083c6a48f6ee33680bfeb0f9f5b97f1fd0dbff98369","0xeb452cb1d0e24006b9224aa98d41f12d0e92246c69a4915692d8d4a4350dd","0x65c384bb53b6325915e311b7630bbca22f34e0642d89a0baeffbb7dfaaca32c","0x3f6ed9efde99413cd49e6b7b88b0522b539668fabd14b71642b58c1705842c7","0x43c8345e8637c178ffc11d50bb0f7ea7a7c6ce9e70f5b37cf33e47d808f5bdc","0x1d37d1625fe43cb7d955455fc52be2d91b06d1c8581aafa3c8a07485bb92dab","0x254a51ca395676a127eab36b65f694789fadbb7436fd0a23350f373bb03c17e","0x2273e5689f1d7e6afb7684f9f128bcf71d588058c6537155ce91f6f5fb30346","0x118c383a186b87837c35b155ff318ea610652531a088fa359dd7864e650c501","0x672916b67e11dde897d15726a5b0c9737f8d25d8cb319bc1bf96991c43399bc","0x6e5e8d6b7c707b3e64d3ace7f17af044a0423efcfd29c73b48f3dcf62542342","0x52a9c9f07da5d3d4c2558e1ea3e042aeebbb22d7f9fbc150d0c14300993977d","0x4f2bc157736d58a285013b6c0d8a44189c0c51658a26b805b4b0b80991e3801","0x18445d608c05617e8883f44ce87b3222d5ff5822a2b9fc4d92a59d2aef606e1","0x10da0aa9b133edde49c99a2287508a0b9eb8f310e0f6831f033a147cd8291af","0xf8b4cb1935177e852004607c2ef098f20f75a52f679b345957e546c887d8d5","0x113f3af2432aa748c8e5f053ffa98861a6c1df95e607ce38049785a1a178871","0x512b3aa42ec433d798199890731c8f1133534fc41b24e8328517aac6bfa12cc","0x20ed577fffda4d24782c7af1dc8fcaf43ca8a61ffd0166599916eedfebba9bc","0x6f7537a42b965a4485a5b3b9094e7c2e031b5daaaa614e95baf535c586f51e2","0xc5b1c44647224481be75e17dce2539d56017794e8ffea9b278fd11c99cd282","0x48c5e6e5871a9d4ff7a892e6d9a9523a9b09fc5e3421888399dda20586916a9","0x5769642deb82cc4dbf681c470f4f9740a950909d8503d8d090bae14fc6cd74e","0x5f9c7a0e6aba407607172c1a6a3a11506a2f157a89fa26916c8876a405cc59","0x4ca38390360cd6d4f99c6428f9da176074a6fdb0e8cd6a1db8e355c548c1cda","0x74e385b71ee3b119a3184b03e59c9215783001a0ac45dd225a0c533e98558f6","0x544ce7422993c6ba8e6031abea374c5e3bf1e01a00eca09161f37d190cbb6e5","0xb9718518d041a9b5663e8ebba6149b7f3bfa101196af40c6386e860b8f7c36","0x5e524963d00ad9270e7ffeb2ea6596b8617f6a473c0c3e00af9966b83e31e56","0x671e7b5ae6b6ccd3efc73a000e0010fe0967a77aa0d9543772947ab6581bdc","0x13b7938303760cf2b71ddeb64196207cd1fb680ed8157dd87cef4336dee028d","0x1d97cf22b3ceeccc8302fcc2d40f1d9e380bc9a23bf19768d8d928e68880652","0x30be229b3e93342fab68fc5cedb3542eb34956dd08cbde96dc99aa1df0296da","0x7fa7d7c5dbf9bba7a0e73185c3cc472b2acad40ec970a089dd9561101f789f0","0x50a271e5e64a1af993e20eb5f0a53ccdcf170b304b98b5d4dcda5a8433f043b","0x5c38a6664b83d9b651be1926476019c286bcbc0626b6b1b6eff61604f036ca3","0x50f8c2b54b08c38bdebf9d7174c5d239165c931e6ccda792a1768ebdf979ade","0x419762a707e55350666f520a927da5f8a681d9cb7e7c7d1b8304645a56dde9","0x773478fc5145efc350ff3ba5b210a07caf9634c1739467381ff02a5d3c185c7","0x14883046c0cf2e3e90873c7b4ccabd95b5163971a458f92adab4b33684e9517","0x218b9f93747362012e60ada2f8744afd381b20f7e8bf9286d2ad67de9b3f6e9","0x5f2bd59bc426c257d3f878b7fe5c81c1841e0e11062a1f452dfa18952d54f4e","0x5ab07963a52a9010c1c0c555032617d0b9e59e52e412f1e6d2be95876eb97ae","0x79a59eb1570a680dcb8a0745ceae5f8d1c1d6f879ac9f73d3319bea7ae16aca","0xb10b74c5cf03034b84b712aaf6dfee5d231c0fa293615d902b41e7ab5c3a88","0x25a93957d22803876b42e2bfc85bcb4f1b0028e3d381550e1ee2f6b918eed39","0x12de03fa25800c8497d26f4d8e942effeb70ec0dea58423d433347c56606dbb","0x3478df88bef8261f645779b974a187d493efcad58e2e4528b89b3a4ce3b4d16","0x1add6156d99cf9389336d9e104e4cc1c04e20e2ef54acc5e6d333f1ab8c7512","0x61aa54230e302f46762b8c0ae771492b3da3ebe12618db35a4dd52d927a8aad","0x4228fb2adb02321495a30a7c5361c2bf887e2875515a6029e04333e254d10dc","0x1890a6a1600a5f5ab572af00f211197eabc22d53ffcf474334c9912681d1cd4","0x458aeb180ed2c02daefafd7bfb9761b677b95a8a1c90ea56b9987fcb4d8fbba","0x1b2f8be5af42429e1d10e0ccb910a5471e7937e6479fe61df58a9fda57787bc","0x4766f5651a2098aa78712f45637360692f0ba3603dc73712c6faa2e732dc447","0x5673c5b0ca74b94bcbe1316eb8891dc395258edb998fe4d7d6231be3e3b23e7","0x66c4f191a4510bde37185fda5a07dcf8f5aebdf0feaee4af7e677c4b48d6385","0x72943f8aadb77bdc65fe5b504208af7f6ebabc0f3520deb0170c9076b00fb73","0x540fa96f76afdae704a678b75602602f0f75731f45a402cabeaed9fc3fcc6ff","0x69a51399f5b32b28852afd339a748db1d00fb62871340be0c19b5c5d2ae48c4","0x328a61976852c9f51e876183875719c1e89fa0b9360d7d746473559204bf19d","0x6c119992e38874fb586586d3135a1db2952c87e6312a69eb7a03a1f53a30b45","0x2ec4a4366018b34a7fecb9a655acd2f944c54e517b4d2071679b6fcff6c12b1","0x796addbac73c596d78239b10cfa6090116d4cefcd8967964bc21dd15f774514","0x4448b7a5731431b0612f5576c8f8aa0538087c193558470d5eecc59aa3af537","0x13fefa9704ae26681209f2d9e1e3703b6a1e596c964ae120aef81e7c3880d2d","0x2e7ff1f95bf80ea9ccafa28abda2a14624d303cf96ca1c68e4ad0d36b90d322","0x17d37679b19f0ed615d2a9adee1fa5f0b4677ceef4c8698c83c0d56424236dc","0x2a86940ad03513220521bacea904e41e8fb619559396b6330ed4610adb9265","0x560eb2675f62d3d3792ef93a5181cb78818bb6ab5b1dd08aa245ca347b63e2f","0x98b23e72ec7dc18784add7e2b51c7df0480d2390916d96e3d1c38c7733167c","0x33f899bd7e51c94aa8feebd21c6e6330077277045c3c2323f34f2746aff44fa","0x4e6bcc0024323ad1588a2425779b0bc70fc1919e1b5f6505e572e291ac3b5f5","0x7d4e4dbf0b34f923ff620245b678decca31c6c01ed092663fd46302c4bc17ac","0x737008326fbb7509a7e7b7055c0f3159327d4e646194729109b3cd64b8c0783","0x2d974abacaafc5767636f647cc68ea4785a0be15563a01d124cc14168d7ab78","0x3a0571632eb0963e1b87efa5330f3a1884e710d7b51310c7e3217b29f3b34d1",
    "0xd0fde4674de3e86f02a34eab61c497a225a0229df51bc658598aa097bc2e95","0x7eae8d82cd0c8bf0a0bdddbce348564ffb60aa7982264c16f913afe619ab444","0x7dbb732ba905cef7b12cc276fbe4dcb8a075a162cacdcf1dd0f8b44312f33b5","0x5b41f9145114c54af46205e9965e122c00aa08bc7962729c51a1efb715b26e7","0x384e1983f68f3bfd0572e46a89adeccb84b60241f1849320d57520a508ecb0","0x491a0a0b481047ad51f2e7d4b291f5a2cb8ededf80302aeea100a8941f20e2b","0x58b10f43b5797689d4a1c2d130fe62b800e92fbad43c1958ef6bc8ea4fc84e1","0x3e0110cfdef31b15cd6fd7dd6132fc8578fa9e66939ae78f10d97230f829d89","0x2abbd145a20306e6266f41f3cc8a52ac1a764924181d27e6a633f0d6ac1f93b","0x9e0bb97bf231168861216cec0251b69c11e93836ff51600f26417a011abf1f","0x3d3678e4d0c5ce2a6980b2f1f55a658aa7fa9b074d86f4857c6e1f91a91239","0x3b5d43847dcc4384c5fbcd2e1994564bb35c054138e9572d36d2b5e72462a38","0x1c8e9484043d404d6d56c787d1763b637c072077a1ca39927f6e91f53677562","0x2140e267cf7e44f2f8556e75870f12632f85c3aad571a1d649828e476d6a811","0x5ff16cb6c9b4c95dbca5ca17d7c446b46f8f1218763e88c8cba7c399a1306ca","0x6df9c5c997fc0208f4e8d2737e6c74d84b678853f8e2f003b6b04bc9f57f267","0x5c77b28d9e80c074c7864ccfe57ef4b513ee7fd12802c04fc83fac395f0591f","0x2889fa49e913499fc7d2da8849628f73a84c5e46be3f68b9a724e64223d8ede","0x4769bd68c37df3cab3395904eb9b941dd2d1a353c217d95c4f2fba96a3a7689","0x492d433b57207e0af2b8be13387afce95d0fafc30150d91f51cd33df9cfb773","0x12305b3a528459ca8649ec0e61513dcb84eb5aa67eeadf1832359cbe67a9ed9","0x77d4952c308750f2d382c464ef48a0ef6f67aca9950d1d45c70832af571d1f4","0x6de6d9915b3a8a3e39b87587661735786561b3cbcdd3c1c9f7ca4ab3ad5d1d1","0x71de2e4b4fadf1f640c11b57a132b01316093b5462391823ecc1502aeb41636","0x5eaf39a9c390b5999ccab94082bedd6764cc12aa05be6d8b7e15d3c0c9959c6","0x6d495b2165c20a9a77c20eb5d91892c4b39a875e7b9389c0cbb970f1c619f","0x4c2fc8f306ad8d59dde6905894a67ca52b4b60b3f8fb2c034a6abafea5ec373","0x2a9cdf8b25163532ebb197f9d72b17cab6298f9c7b411d5c41f776d5a7f73b2","0x153b90dd6820963294f7d4ea0082b9c87d94ff0c8b7a2bc13a586b12b142f4d","0x209c9ed218bbf05f4c7eb0e36426bc8ff0b8faa25caebd03289c48fa38253da","0xaa686eacb376f378e0fdf8862b3e7f463fbacb54b934632ecf434e18fef9a3","0x19aabf0b483f66421e7d51031972f9f6888c5fc53f070425de0356ddd6b5874","0x6c809860c3c1fa6426ed55e14ee67de4f4978e3cb7579c35213ecbc9fc2b450","0x74325a00e775ccee1f5855765bdf1c00379125dfeed48e1380de1e546d1d74b","0x27d3b04a2258faf35755fef1f64049f597723a53dc13c8f6242c8a87fe9dba3","0x91700870e82d35406885c860d7477e35945071fe7bbe48eb7c64e1ad01f383","0x262491413207adf7730f39328cf0e5af5c08b4e450db574e3a511f12672de2","0x6d910ac9c0e350289a1c6c670f9a2a59a9b1cac017315a93280badf96acbf78","0x652d48667d6046a7be554836fdba8371a3878e68c1743a1748c655a613ab134","0x75e6a58326a14b8782c7c64ed6dfa41e10757fc8a237683b7e5e00374831c3b","0x51928d8ddaf112bf3c0b002f3146ef45584e907953a0e83279d2e831ebe25fd","0x14f59c23735b4aaaf6b6c0df567cacff9adc27f50dcb8b5270cf1237605c263","0x448bdb75d6694b6f1f4fff28800f07c8fb2934c1251ec94a2ceb39fdcdbd9a8","0x73298a2ca8b06596d7bc85311c1c9d06458664a02a341655dee4e663600ac53","0x558a250bf93118056d6a59bf4603c9dfa393394e09fdc4a539887b56bf6d7ea","0x56d5a6d4828d7786d0b8915e63c7612be59e740fa452ca7967690df709ffe27","0x300769060d03a8372d6772d737d126c10bfc3c4d31ab3ad5f4f0612aeaaf2ce","0x7ca644bdb595323714fe1340efa1c55d4372b20c12b6b06839c06c26586ed78","0x6c22863f7ed044ee15bdf4412b49502f5df85832222000669d2b27a122c6357","0x575c9dc79cf573f937d42787a9ea06c475fcd1690a2517e45efb1f9cd6dfb8a","0x38443221347110f244feb5642eafe54bfe0a8fbd66118e62ae10fb32aed9970","0x4c8f3f49d3d76a34aa1c3f5381b465d0f4c5ce7feed1fbec919808932d16880","0x1aa887ca437bcb21c1c977dd04e6b265e98883a611df1ff485d3f5647af2f67","0x5c30b58c9385987a115043252f3bdb0962bf27cb25177b4f064c3cce72ba441","0x7ea12aa1f7b9f6906ad23674b54e9c548da03ca9247a2de671c20490beaa957","0x6b5b89e07efa6d1e686483567bc2862f664aab9e9627a4b9ed945cd790813b7","0x7b0844f804ef6719cb423aa554fc96feb3753292d40db068a10623d3ec915d9","0x3d7f0e4f0339d7bc8b5930a35a28780f3f0369f853b49a60aa887a95a165485","0x21cfa1ab62008896f10b50d972ed0f53c12eae2cf636b03f47f0962dfdffe6c","0x5f7c1bddc7eb12910ba86a4439ba5c3e99aa5b16396a4b4f5b0517b2d16af0d","0x32ec16a5c0e9c77383e64f55202c3909a2cc0dd449e98099f3cbd19c25cf6d6","0xb20e37dea71d962b1bfd9ea42bef16162c3f1711b7cdd7472c996795a00bb","0x2e6eab1f114f928bbd408c37e48c028618e6f2281d35ae5c8be43582ca4d19b","0x70b34332adfa827ea4831968a4d16cb4cc09944fca3b0d71799fd1bc8d86efa","0x74fc6e1dae5e60870b03c1425bcbc6072d9f413d1e0bf41e1d3c17b642ba25","0x2074a664712177854e37b38f59843d254321d5f3557a2cdd1c5f6133dec46d7","0x1e868e0ba1a52671eeba19fa64c2e19ce66a7af9f3c1b02f1f910fc7c458203","0x44fd59a148b81ca92b1d34882300b09f09c9ab0eee69346fdfbf566d24495e7","0xd0dffa718255550fa1468d6d75e6eabeca605860f4c1f8454930d540d7a055","0x5e33a3447cc4e43d3466dfc740b1666e9fa2d4cc926ccb7fdcd9ee3989b72fc","0x9b2b57f59f93915900eb074fc334661acdade0bc018edf7145e94a64764758","0x7ee734d126f1d48100c3d4971fdad3815078fa3794e4eded885af47cff482da","0x3a9ec5776e1170435b540347f534842ab08ea303e043a46474ee4621000d221","0x7f512a047510cc536753edce8ddc6803d766e29065221544c6b5bfc39bbc0ee","0x6af24d2bfe4fe3d5b42701573363649b1b467d5dc424c8d6605962bc0407680","0x11d58af838c0c2d8e082f1425b34c12908e734ae4737d4086d70b58d6205002","0x4689d86d3c74c4db23398a9a3a2c2010e52bfc4a6639e477bb073774376fbbb","0x2708c94df0b0a89ad2978b9b788443a78879a3cd22fbda2a1cc85aa8c179fec","0x1828558b0645a876e0b5f69b81348ede3c70be5474d237d75fce53d96129d22","0x483777acd1a904425b6e3415e205235306e2f16a6622e27ead9093354c6879f","0x342e2a3f03608769d39021919cf5dd05bbf0c41a887b187fb18eb64a046a47a","0x32b34e5e398117d4eaf53045da3bc39d9b9bc21789272f1e83ebe8da9e20745","0x22a1b06f02f67f36ac2333756ed438fd3aa69ef1666681d8c7660318f56d523","0x55ca2cd7653b04e7c577011c00a63d1a23176c6de6c789c31efc8c9f540e024","0x11ca89714cd08dbe3cacc4d82efc3100062d3ba2d3f05b47723d217ef2c2775","0x660f021f95eb51fe94f43e3155d1c735b167b0c904832f3615fe859dc700af6","0x772502ab623a35dafb7670fd7d130836169e84673a8a00fb25430aebc0e0e8e","0x54d07deb3762288e892770365dee3fa91bcab35141750b0713154989e15ee0c","0x646dab1f78fd1428f6310baf410259652a97d8e56226577ede9b1257e8f70bb","0x5201c01ba432a63a450019a6fef57b838bc31cd4afb9912d796e11e2e96c276","0x3a72895c87f835ee186525b370f7cfd1a9cd0eefc4062591509ade311db9208","0x3d1c067b36e09f58a877e1613bf6a033c2b75f18c67a1038bca284856a9d7bc","0x3096bc2ca594d24bcb027555d0dea1274623d1a00dfc8fafbe9731d8245dfd3","0x35c9f7c02e051568bd5243e0983b5f633075a55b32bc98f09335cd5e8e026be","0x591ba3a34a68f0558b4604152dc7d2d9f8aa7eeec1be2998dca7db3e235889","0x18fc6db3f4a0129f57f4a072b4077dee1a10139e659de497f5539c121e5fc65","0x4d41eb636bfd4e73529e233588bae7f8a958db6b655eca759902a44042f06bd","0x6f567bee727ce8c7268215aaec71117cc4c1683927cb675320d45375da9cc3","0x23151fff7347d87e6e8f0ae80cdf4b896a27b500a07e43550ed62664328e76a","0x4d71b8b93e01bcc485a2460eb506c1f7d43acc3999a6a5d3b4a75d650b9d47f","0x356fd38c38f8bb142778e3c772da4867edae02dfe144722bfe168f7287a8ea4","0x1f469053fe844eeb604973c666bf24305f840eee71ed32b6f43eb711e934821","0x64fb7f85fd9dee10c313696b0aef1f4afc888ce8422edbc2f1695ec5ed152e9","0x477b50ac798dbdd3b693de00e87e2034068be3ba94705febe49b208bba7f61c","0x4f5d747c9cd313d4d395b9e0ad49cd116887fa94f9ef2f742b57150a771cc3b","0x1dabf726b0df1a2280113038126fed174bf3e74844b97eee932020b49c35abe","0x62dfd582bb22ab9a0730ccc9420aaa0411e80747fb7e9cf0c0b4ff773f4c8b8","0x29ddfd743f6663570eaddbc40d09e2722a68835fb0a4041e8c6cc2a72a7920b","0x46d240530368874c041aeaf73e7be7ebeecc2d986752e59da44c1be795aa664","0x3e2c9050046ceb7877756c0c3e8ae8d03d47c3d4d851039fd42acaf20161da7","0x751d5e40aeb576e307fa7c4e723b25259512f4f6ffc04a00300c18262e1b37c","0x378ffd8447ed05feef40c056dbdf5575d2afe3f6169e27141dc2bc5f74291e8","0x4e40393a87380cf71c6ed6e5a517645c5a3133c90fe1f0107ac543c72d0f2eb","0x4122eb879a39b0abd2a652b8fbf75aba4d9a6f05d21d0baece3ad6f67a9ce7","0x6743d4cbdd11a6a2164a647a0c7e04d7314b03f962c1a30d64d1dd9f353e5a2","0x3325ad4dcc88e39be83a0070dbbb18efc6d087b0a3bd0ea22c57f4ba0b5c5ab","0x30f38c37ad6a184874f2d41079733c6c2f5847644692eaa443066ec3a12af8","0x20fc5c69c7f28d3d2f6c1be4aafd17d6abd960ba5fc013b24f36120abf929e7","0x70f0ff49ff77568d92d7b4fc2a4b0b80d098aff5cbf9fcdedabc6cec088df1f","0xa4ddbddafab6157739140c3744ddf4fdb838b78844b12d67b41cd1fa06fd22","0x48e2ed7ffe08d1fc67a90bf9fd80212753b7ce3a8216f466dacca79ca4276c5","0x2ba76c537f6cfd944bad5e6dda9b112578f5803050e693e2ad8d6bd6e6e7ac9","0x6ac60266e2fa2696638e311bf915f8a29b4d6807440e03a572901f008ace73b","0x122df3dc30c418e82cbecc4fc6608788004f592870af2358c6cd23f09de917f","0x1ca1ffa4be5557d25a4b7ac7f7a3bbca121d96d7579dec75c004debf484bcab","0x2eebdc3d97202fa4d2b41474be0b13b4af57cb3175ea6d8d230b6aff49652f5","0xa2272aa16528c3ed53c9526ec1228ca05468240b781f4413ab22fa2c5dbd25","0x6068a9adb468aca6f9d52971e2f0d96f25383afe37441f6b72a8d5f3631689","0x7414470b4bb746db8cf22dd70a2007dd3e844657dc677ef71ce48ecd31e281e","0x9aca694620c8db103daebd9f88ee5673c25465bbda3e62e46e7eefa73a5113","0x7f98f6af0ef312afd250fe16862a9ccb62e1a957e15e051d928a9408d37dda0","0x14dfc4e19d57c72220bb04f58e7a47588f878a840d7532627473b9c85633f36","0x4e52f8725926bb90ef0d4f12d8694d163e655af330b81ba39244a9cf60d0003","0x1c4edbb9e00fb59e3afc0c25c10114ccc974b70c6e043914d79b80a83f7c073","0x462dec9b5805711af3487eeb8f2060ee8ddeb8d6d511d5df6d6196b9e4a4174","0x7ea14997e2b3b750e95c9dd2135efa4dba0f8f1591be076ba0fd00cc23085b4","0x74b5915ef3f1e4ac969fdee671d9eeeef8a83e5885cfab66279baa64bd43834","0x783c4cc46fd9070bc1474992701085dca2dbd2ed1a0ee829a8baa15c23c34b6","0xf087259d3921f39c634a5d35ec4c377be5bc12ff44cfb67540b2731326c16b","0x21e5e20ca9fd301b91d00c6c9422e1e9c75e696276623eb0d9fdae5d2347f5f","0x4926a782cf0cb1af00f6fc98db1ef7d25d1108a0e15a70f065f45a04339afb0","0x475c86be8db3520aefa3d3e68fa52870bfdbf54a7a0e2104c48b118a0d9d57d","0x3acfd2ac357f41054e8fa75c2e647dba393702f1b8e840c48de9772bd36aed4","0xea7aabac5cc53668ecb586620cd302f178d880b5842f06c25f25a21b450502","0x722a137921c8cf96162fa7ecad62deb1b0779beae16bd835a0c9adeaf40970b","0x5d54b2a7080caffcefb6a0162f66e46950d727b4b51359585a18ad060aa5596","0x2fcf0bcbce6f6bea9452fa7ca1a90420b48837b684d5c33722d4da359bfd5a6","0x45a7169648a92e830489e5ff1a52effd090b26695ab6b9601bf1a03e652237e","0x23e0fc6eacb4fc92647cbc0764c8d83d01ed25c0f30951f79767604ba254ddf","0x4b3db608163d81a9b2fcccba6e538859a74ce4266727ea160ffb1c8c83e66f1","0x7b434e0baad6920501d63d7297f5126c6c0ee46cc4eb03a01f9673916a00ffe","0x6e29d45bd9a3efaf0dc85d7fa08153aa6b827877acd3b47fec65e466d697529","0x65af1aeb618b58d2993760818a29c46efe1b15fa8a17cf4b9f879ca278d3e1e","0x1deb50cc6f0535bbdc61427d12d40ccc836726a9fecfd4845c6e8fd1d87f590","0x229d2fe096b750d0edd1d157c007823fad7996d381c0e587f714c2f29523c2b","0x3e22eeee11155cad400c538c5f43d6d9cff43c859c7cba2e678fc00a384786e","0x3708be0d5baae5c56495a402d66cae62ae1456c84bdd503fe94cc20e7a0fe36","0x5ca1630557712fcf9b321e683321050d6fd9ead600116841e9656afa08add54","0x45ea1666f7d34eb542ab8a0d5b7850c79226ae457cfd3cd331625fc5c7fa96b","0x44908102ef863ea889185b0a2108a9d1530ba4e696ddb4752cfd80f81393398","0x5d37df66809f285b49a22b32f05657ecc238961b87380ee7fb70627de52a5f4","0x6419f7dea356b74bc1443bd1600ab3831b7808d1ef897789facfad11a172da7","0x31c807b795cb29a145e297db078be265946294f60f88a71a1d260a2478b6f5c","0x3d1525605db970fa1724693404f5f64cba8af82ec4aab514e6ebd3dec4838ad","0xbb8601ce7ea6dde8134e6869794ca68f2448da9b50e00fc755de2954aacf25","0x5beafe61d25dd1362a00003006076a718c9cba54251521d3a03d845c419a22c","0x4a678afefebe23a2e785c358f242aa4ac69a0339d0827cd95f7586555c4ab78","0x755a131c6c9c971ec52d0c572013dfe6878a5c5cb13bfc814932504bfb96b98","0x3c75143521a005ebd8828730dddb2da764e9c7fb6605dcae1a661ee4ab45058","0x1bb116e7e4efb1df971c587df9bd2bd0f4bbdf72860f202e5bb8d47f6ebac59","0x7d6f29f8039e5079df1d7d4ab4240caf714c04b638de4b5b6e27e08fb43e0e","0x3f452da11241f69e169cd6a0d1cba6bebe2bf81efd3a8ebde7bf7c6157566af","0x4036fb7031732e2804828e74d8278ab253f4daf00052b487bf56dfac05ec784","0xce8b3807ba12a2a761d0e23c9a36bb5d30cb22a3003c5e323943bee22f0049","0x58d88ce69df88a88bd41ee1fd6184b7b03683969a6f371593a65bcc9ef75a58","0x65fb3b5417bbdeea0230ff028d5b2a957cea499e23e0a5ab71e8697757658b5","0xa67f9aea94d005e3d326741a0be66081a09937a4c615283ca214e51579ee96","0x4e11c3fca62640783d86d48ecb15584b635dd0574a04b7d164b379773220944","0x26ae3c1a65a90e6ee1427f01e01a34424c19145b215b83943b85eb8f6139734","0x479c10a66423011bed776683b975fd2a96a90c1ba985cffe8acc6db2de4bbe2","0xa3e293b4648c005f0cea18b6170ae1e84cd32c98d340d49283370949825d89","0x5c87f08532271b3f193cacbbd8e0dbe0c65762da6a0ba7d7730367c6fdf2ecb","0x49d40ccfe9ed7d32aeeda8920bfb44294a6e499fc8ba3b5d3706b33f9819edd","0x6ac053923ec497cb0041368cc959dc2e7ed80dfdd52d03a55c9a21bfb89202f","0x4f45667191d7a0a4e20d1e5ec93a124b823d3b5316f1d7d9211c527d54e8d6b","0xeebed38501033ca99006f62a5fc4f9c7b05db5d28dfe48deb9a468b2f1348d","0x717bf5f4b968d30ae0570950151bf8ba6985b3f63001b83c079e5058b41938c","0xc978575c9cb5e43aaff5a5e1a7e31ec1bc3deea6b26160e66c1033b20b42ac","0x392befcfd649f1f60100d49b38d634b70ae04e2bbdcc2f56ccce8ecb90e8e25","0x2bbd60195b5515b04a75a640b1d41c156f30c5d27bdd5e85d791ec63c25718d","0xb1ddd66dfd43f359706730088685770a2dc23ba097d56837d06efe6004247e","0x4984c3a3d4f6d0f0820e75a2e99ccd29334e3c98dcd5ffff8ffbf9ca5d5d9ca","0x4d7dfc67abb4323add7bd6bb305c4787a3f562bbbfa4e47c77e33cc4a79372a","0x2380614d4988e65a28ae462f6b321eafbaebcb2481cc1d4c4e3650bd775e3cf","0x72872da3a730672e31193e99006604578227264f06333b4d7d5bb9db390664a","0x3fceb0ed447c2264fcfd40ff620c5d6c7350c52393511c0d7ee96f3d2bfd45c","0x1765f49126f6488d4024ecafa001a28b212316dd6e3986a5c92da27e62ab6e7","0x5c27a819925b727a5289f940d92d4b1662df71f3f05b9ab1f826c67a5af05c3","0x5432baab704250753f66033270bded56de4dfd64e334b9864bb688f15e4ef5c","0x2b7d4c21247d503823d7a25d4a4d476f5c50cc8b5b26da3b71465ec8652deec","0x34429ebc7d045983ef99693200edd786917792785c521e6e48a90259927d8e8","0x1900d8a01ae50ba0b05cf56e2f6da06ca38f2d9ef57ab6ccfa10ba7c2b8dfbf","0x404bb3076cef4a0369807b190de75b3100f9eea7464866f7a7c7c6d570ac662","0x66233339e6558aa35840a0f102ce4eed43b0ccdbe0140ac8f816aa464d8e580","0x5461f697ba64e6f320da80fdeecf81ba79c81305e02a1b4014c22289a28bb9d","0xb267c09c44cf190c9d21c1d19c30425c245f48921b3ef1cac8f237701c56f2","0x2c625b07f00babc0b2286544edfcff48f20f54473e53c66ad31045507b9c373","0x4a08a4665061469b0b6e7af52123f3de5dcb016e8c6751dca4cce8da290c3d3","0x76ebb8893b9ebd5d3f5a903426a396003a81241bd3ce8e4b89cf276bb7174e9","0x299713aa82dee87e89f6f9025eae26130a303361da97e82c73d5858add64584","0x7124c59cc2cbaa83dc1e934df785bfe3dda7007245542a0fbc395b6cb2aad5d","0x2d3bb6dafd31bb229684d718ce2c73b20dde8eb4b6a1417e82f53d1ea3a9148","0x4481f7b6f4510a66a8fb0fb86bae460bcbe11e0e6ff8ca3b800afb349e17abd","0x733cf5d03da300099539f0332bd684194a960489298e6a40d2cbaf76b3718ad","0x6bd4f0961b786f1261fdeeb128fc0f67661a8dce32f79e02dc40d389b329a81","0x102e27ae2f326ae2e558a01f2c627f807d33b823877da685dc85d141cd3be44","0x34edeb67e0811cde167fa22d9e1ba1a69908aaf0aa28cd933885dc3802792c9","0x43cecb314b26509f9fcb9f80d1f6b94ea7d34230e1922dcb51a155e89007a2a","0x571d4b6f5a34d7a43517d2eca4166804f753a643ec28bec0f51143bef50a9a6","0x20c7c21618918658814e4349c8896c1853042ef44792c328a458014b7c0ee23","0x71bdaebbbfe10fc66445e031e4327272fcf8e15b897632123933703e8361a47","0x5423287197fbd5fd3f5ec3b929b36826b770f47d18dcc16e70a25338d7041b3","0x140f4e3f494db59a141bc07cca89b2f9b5061eb0dc6c9e946638abb285d6626","0x4396a314248b1f0e677fd892ea03264b4d8c04298f01501a9818e85dc0436d8","0x235ae5cb65ea261547cf768d143f311d5cddab090153a728b711df931a34567","0x6a1f8c761754b76997279532a7e5b253717bb5f0ccdce78fa0a0fa4014eaa2b","0xa695db0214dda0b99bf2d007b2f534fc8d15cabfe67551698e1504737c8b02","0x1dc24fd7bea304c69e41b0fc42d2709694dea61b4fa42550cb835e688822ede","0x14c71d984c6bfb5b43894ccc58dc7c4e8136e18cf9d5d9bddd3ab2ad4d433e1","0x16fd9fc8aaf4855ec9c2d6fa5144caf29349feb41dabb5a7217bc8ce16149cb","0xa383cc94f9cade659db25a8ca68ce6fb24e133fe24edfbb54773417600f2af","0x5d91c9835341444c1b43f6f07f9ad4a449575097ab33c0cd743f2301579425f","0x5063120f5df6ede7bffc6e0730bbea776c1bad0e3071685a83f103eba1fcd77","0x4eb20526acac5faff57854c3ece106908c87cf8ca82340b047475b901c066b3","0x7174580249696f36d98091a56e72a72194e8d1195012aaea04070eb7e8030d0","0x383db706792e2fe04022a12571f9a8f7a2edea6f7d46c53d904ac5daf19a203","0x15f356376bece540fb4417e4fa809e0f8e8636062b0a8dc8be25b364eab59a5","0x5283ebd75d4ad7d3c1cceb8a37dc0cf3deccecf743696aac2a865a8f37fe7ee","0x4ee4b1386ba891c82364ed5d52305cd4a0964b3a929825c0bb0bbd6aad5474c","0x4c5a81396849724434ca58bdccdc68177ac6db5ef219823361795fa877c043a","0x5f41ad38bd003ff466197e9dc231d01528ea8847ba58b55f535f289faf679d7","0x5d047e0b951196e85e521ad81c911f3cf8b0f202db82f1574632838c4b4f6bb","0x44870d03d417a92a0b8a7e2e9667b897d7499637739d427fa2daac9295f1800","0x7540f121b6e92018f038d38672bd15a981c8d435d2f7b610ef79a53b048cef5","0x60e1b9f5e6205a28ff2cf5ab7a8fdaca7e68a6c9fdb0347da188a880ae463f6","0xc7c07a33886c6831ec9afd205214973c8825330921df9da47471f1dc78df2f","0x680afd6b0843e7851390521d87e849f010babbc608ba53dcff02b1c0fcd6fa","0x178163aab735da57760f1353b2cb9f302cf70af2ad8692a5b0aa87276e1a4ff","0x61920a96ae1bf6e8b019080852f9e920aa999df228a804502bf5dffd5d7de72","0x7c00473acff9dc8b760d8f7ee27fe8bfd5710d607dca2b3d0597a9d47a39808","0x3f9bde2e1af79befd719c7785b828bb0bbdf1f9149fed38b5c1105a7b3a5b88","0x40a85005f0dc493a610ec8f5aa4713ae611b701d4929c72c4b9149dca6fac66","0x7c616595d9f7c4c4540533989198b05960967b9a3219694eface4af5864af40","0x220daf1e98e4d8248b6d1e235aac81ed7c86cf5472e18699683ba817d1a7aec","0x4cced5156ab726bf0e0ca2afeb1f521de0362e748b8bdf07857b088dbc7b457","0x339e229cff45f93eec467d60ba02e0f85e15231e3a290d5bf6c97da3bf2fac8","0x392941ac5bd720082cc2bb64b5a552207e9dc70f7f27435a0a2d6b07b1ef69e","0x1cf3dc684f8d4e618d1ad683fecffc24ee14a4e4b5e6769519660c36f3b1a9a","0x1cb1270ff2d6d5ed9965d101b61c7e486d06bde1c2aabb8a2b4f3806ea30ac","0x126e3350ae349f15fd90d0c38fd4b61a306c114c5ee63170cd82364befcc983","0x2b27457428b94b38ccad5339ebc17a211b7c482c008ac8ad22e01b30e923628","0x5a734993f63fd6ed9d98c9403fcfedd2c8f7c451e49c189d164ce6f3e321372","0x2d3303de190fb138b2eef8c7017b5fe4ed54165983698eb35b8fcb3e5171003","0x357be563ff5cd73d77866b38a1198a9396011c4797306b99979626569e9c45d","0x62b8e79f0878107ed1eb3bd6c17482527b7103a698d34b3e45aa3af0cb07e5a","0x27e1246df8361c28a7f2497fcc24aff77ed6850d91979b3f6898c219bc5b020","0x6fd089667ad15016fa88eb492049d1ad723f6d37c2b39e9669745318963830d","0xc3970014fcf3b97fcf44c249e06f2c7695966656dada64cbfe18ea35446a33","0x2a17512426d7163774a41f068d52e24bce92090b5dfe37c803c0acdb8329cde","0x606876b49c0a26f52c12b1b8fe1ea900d2a712788d1083ffe0e2be72651c116","0x5ecd805136f1765eda7d9466586c8355510ea8f15e1324eea2b31fe8f6e7132","0x457cd56e0ada0dde18b8f260bdc3a82d19dfa36c45aa029f97536349ee34c0f","0x5f4bb7eb0d99786214779746922fb4d139404507069129c19af051ee324fd48","0x1f32c34f3c8974cc90a4daa3d6b4d4968c9d7cde5e42ae1001eb3064d765a2f","0x4b68570b4a7f72df4843853c5dc77131c885222a584d4e2df9fb3b12229902d","0x3b6bad5ab6439b88e9b25e6b172e34769ba29707e7c26f920c2c41ec50e0e96","0x16154c7a550390ca947c6c31879ab3603dc6e801e77e8923c37e3876480d326","0x74e3b59a1973012c0c3ec84cbb32c694a75f647105aad1589f158199786ea0f","0x38b4b702df2c730c600fa44db2e5f48a1aacdbbca000a3ae10705bb6adabee7","0x5beb874aeac1e78d3a7c4631aeda985d67f0a58273dd70566f54403de386e59","0x1b7e6e42f884b783e8d61b87e5c69875f66a842ee707e123f26e4bb598c6f7","0x3329497026d984fc46a8b50c7794e24cab94924806abd38a27e223f7173dba6","0x42ba263f8701efdb5c5de72e81801a7e22deff1fd7bb1440ac54474b5e96517","0xb0e198aaeff13e6d813f938c4c1bb8c5409050e5bf62cfe1620c2652c0d4bb","0x69257dd02708446a287cddb6906b746a3491ab02b43718db1ecd8d5179d0116","0x1dd39a78344e6b296c79b8fd06b479f95740070e6b0a2f1d22d00f2e54a72ba","0x47d6666730c78784c1a4573cbf2161de0c169f5355e49ba25a380f544373c12","0xffd80f799d311810346c9b1349b07562a1ea2336d7c83d62cfd0a684deb468","0x7967ba3bd93891d26e57de1b38948d60c375b76a74d74bed5b5f7ed992ec9c3","0x3b8fb5d455ea4a4b831a1f76c3dac5747c81ea5138629ef76b93a8d79731405","0x19ba10e1cb91c55b68805e99a99eda4ae9b4d33c4d4490c0a830578817f133c","0x6c2239dc49976146b4d8b723219f5d76712889bbd7c0b0be35474802ee9f7aa","0x7137ded73b1d6576dcdfda7611463a36686e7aa870fe8f9edabba77123bb870","0x8c1060e65eb111a6a00fc5606e4189ebebbc37d6b6eba51326bb400573feef","0x33a838fed819d1a565becc2fa2326fda96dcc05371cdff664c3bf1fb756a8e5","0x15593c09e35b1107cf25699aa31a48afa27921e13fb290768a3b357f1d56f94","0x463597970ec65ea31a7ae79819102879d12cfcb5f923311a67e9db75618da36","0xb0fd021ad9447f4c0d04d2470ab6740936d55b78db14376d22dc5dfc68533"];
  
  // await fetchAndStoreUserHoldings(userAddresses);
  // filterUsersByEstimatedSize();
  // compareHoldingsFiles();
  fetchTokenBalancesForFilteredUsers()
}

if (require.main === module) {
  // eslint-disable-next-line no-console
  main().catch((error) => {
    console.error("[XSTRK Sensei] Fatal error:", error);
    process.exit(1);
  });
}

export { fetchAndStoreUserHoldings, filterUsersByEstimatedSize, compareHoldingsFiles, fetchTokenBalancesForFilteredUsers };
