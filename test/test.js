const { ethers, JsonRpcProvider } = require('ethers');

const { suggestFees } = require('../dist/index.js');

const { weiToGweiNumber, rewardsFilterOutliers, getOutlierBlocksToRemove } = require('../dist/utils.js');

const main = async() => {

    const provider = new ethers.providers.JsonRpcProvider("https://polygon-bor-rpc.publicnode.com");

const FeeHistoryResponse = await provider.send('eth_feeHistory', [
  ethers.utils.hexStripZeros(ethers.utils.hexlify(10)),
  'latest',
  [],
]);

console.log(FeeHistoryResponse); // Check the structure of feeHistory and its reward field

const blocksRewards = FeeHistoryResponse.reward;

console.log(blocksRewards);

const outlierBlocks = getOutlierBlocksToRemove(blocksRewards, 0);


//     const ret = await suggestFees(provider);

//    console.log('Result: ', ret);

}

// console.log(weiToGweiNumber(1000000000));

const blocksRewards2 = [
  [100, 200, 300], [150, 250, 350], [200, 300, 400]
];
const outlierBlocks2 = [1]; // Let's say we remove the second block
//const filteredRewards = rewardsFilterOutliers(blocksRewards, outlierBlocks, 1);
//console.log(filteredRewards);

main();
