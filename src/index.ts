import { JsonRpcProvider } from '@ethersproject/providers';
import { utils } from 'ethers';
import { ema } from './moving-averages';
import {
  BASE_FEE_ADDITIONAL_PADDING,
  BASE_FEE_BLOCKS_TO_CONFIRMATION_MULTIPLIERS,
} from './constants';
import {
  FeeHistoryResponse,
  MaxFeeSuggestions,
  MaxPriorityFeeSuggestions,
  Suggestions,
} from './entities';
import {
  calculateBaseFeeTrend,
  getOutlierBlocksToRemove,
  gweiToWei,
  multiply,
  rewardsFilterOutliers,
  suggestBaseFee,
  weiToGweiNumber,
  weiToString,
} from './utils';

export const suggestMaxBaseFee = async (
  provider: JsonRpcProvider,
  fromBlock = 'latest',
  blockCountHistory = 100
): Promise<MaxFeeSuggestions> => {
  const feeHistory: FeeHistoryResponse = await provider.send('eth_feeHistory', [
    utils.hexStripZeros(utils.hexlify(blockCountHistory)),
    fromBlock,
    [],
  ]);
  const currentBaseFee = weiToString(
    feeHistory?.baseFeePerGas[feeHistory?.baseFeePerGas.length - 1]
  );
  const baseFees: number[] = [];
  const order: number[] = [];
  for (let i = 0; i < feeHistory.baseFeePerGas.length; i++) {
    baseFees.push(weiToGweiNumber(feeHistory.baseFeePerGas[i]));
    order.push(i);
  }
  const baseFeeTrend = calculateBaseFeeTrend(baseFees, currentBaseFee);

  baseFees[baseFees.length - 1] *= 9 / 8;
  for (let i = feeHistory.gasUsedRatio.length - 1; i >= 0; i--) {
    if (feeHistory.gasUsedRatio[i] > 0.9) {
      baseFees[i] = baseFees[i + 1];
    }
  }
  order.sort((a, b) => {
    const aa = baseFees[a];
    const bb = baseFees[b];
    if (aa < bb) {
      return -1;
    }
    if (aa > bb) {
      return 1;
    }
    return 0;
  });
  const result: number[] = [];
  let maxBaseFee = 0;
  for (let timeFactor = 15; timeFactor >= 0; timeFactor--) {
    let bf = suggestBaseFee(baseFees, order, timeFactor, 0.1, 0.3);
    if (bf > maxBaseFee) {
      maxBaseFee = bf;
    } else {
      bf = maxBaseFee;
    }
    result[timeFactor] = bf;
  }
  const baseFeeSuggestion = gweiToWei(
    multiply(Math.max(...result), BASE_FEE_ADDITIONAL_PADDING)
  );

  const blocksToConfirmationByBaseFee = {
    120: multiply(
      baseFeeSuggestion,
      BASE_FEE_BLOCKS_TO_CONFIRMATION_MULTIPLIERS[120]
    ).toFixed(0),
    240: multiply(
      baseFeeSuggestion,
      BASE_FEE_BLOCKS_TO_CONFIRMATION_MULTIPLIERS[240]
    ).toFixed(0),
    4: multiply(
      baseFeeSuggestion,
      BASE_FEE_BLOCKS_TO_CONFIRMATION_MULTIPLIERS[4]
    ).toFixed(0),
    40: multiply(
      baseFeeSuggestion,
      BASE_FEE_BLOCKS_TO_CONFIRMATION_MULTIPLIERS[40]
    ).toFixed(0),
    8: multiply(
      baseFeeSuggestion,
      BASE_FEE_BLOCKS_TO_CONFIRMATION_MULTIPLIERS[8]
    ).toFixed(0),
  };

  return {
    baseFeeSuggestion,
    baseFeeTrend,
    blocksToConfirmationByBaseFee,
    currentBaseFee,
  };
};

export const suggestMaxPriorityFee = async (
  provider: JsonRpcProvider,
  fromBlock = 'latest'
): Promise<MaxPriorityFeeSuggestions> => {
  // Fetch fee history data for the last 10 blocks (or another number as needed)
  const feeHistory: FeeHistoryResponse = await provider.send('eth_feeHistory', [
    utils.hexStripZeros(utils.hexlify(10)),  // Number of blocks (can adjust)
    fromBlock,
    [10, 15, 30, 45],  // Percentiles for fee suggestions
  ]);

  // Extract the relevant data from feeHistory
  const baseFeePerGas = feeHistory.baseFeePerGas; // Array of base fee per gas for each block
  const gasUsedRatio = feeHistory.gasUsedRatio;  // Array of gas used ratios for each block

  if (!baseFeePerGas || !gasUsedRatio || baseFeePerGas.length === 0 || gasUsedRatio.length === 0) {
    throw new Error('Error: Fee data is missing or empty');
  }

  // Estimate the rewards by multiplying base fee per gas by the gas used ratio
  const blocksRewards: string[] = baseFeePerGas.map((baseFee, i) => {
    const gasRatio = gasUsedRatio[i];
    // Calculate reward (gas fee = baseFee * gasUsedRatio)
    return (weiToGweiNumber(baseFee) * gasRatio).toString(); // Convert to string to match Reward type
  });

  // Get outlier blocks based on the reward calculation (adjust index if necessary)
  const outlierBlocks = getOutlierBlocksToRemove(blocksRewards as Reward[], 0);

  // Process rewards based on outlier removal (using reward indices for different percentiles)
  const blocksRewardsPerc10 = rewardsFilterOutliers(blocksRewards as Reward[], outlierBlocks, 0);
  const blocksRewardsPerc15 = rewardsFilterOutliers(blocksRewards as Reward[], outlierBlocks, 1);
  const blocksRewardsPerc30 = rewardsFilterOutliers(blocksRewards as Reward[], outlierBlocks, 2);
  const blocksRewardsPerc45 = rewardsFilterOutliers(blocksRewards as Reward[], outlierBlocks, 3);

  // Calculate EMA for each percentile
  const emaPerc10 = ema(blocksRewardsPerc10, blocksRewardsPerc10.length).pop();
  const emaPerc15 = ema(blocksRewardsPerc15, blocksRewardsPerc15.length).pop();
  const emaPerc30 = ema(blocksRewardsPerc30, blocksRewardsPerc30.length).pop();
  const emaPerc45 = ema(blocksRewardsPerc45, blocksRewardsPerc45.length).pop();

  if (emaPerc10 === undefined || emaPerc15 === undefined || emaPerc30 === undefined || emaPerc45 === undefined) {
    throw new Error('Error: EMA was undefined');
  }

  // Normalize and bound the priority fees based on EMA results
  const boundedNormalPriorityFee = Math.min(Math.max(emaPerc15, 1), 1.8);
  const boundedFastMaxPriorityFee = Math.min(Math.max(emaPerc30, 1.5), 3);
  const boundedUrgentPriorityFee = Math.min(Math.max(emaPerc45, 2), 9);

  // Return the priority fee suggestions, confirmation times, and blocks-to-confirmation
  return {
    blocksToConfirmationByPriorityFee: {
      1: gweiToWei(emaPerc45),
      2: gweiToWei(emaPerc30),
      3: gweiToWei(emaPerc15),
      4: gweiToWei(emaPerc10),
    },
    confirmationTimeByPriorityFee: {
      15: gweiToWei(emaPerc45),
      30: gweiToWei(emaPerc30),
      45: gweiToWei(emaPerc15),
      60: gweiToWei(emaPerc10),
    },
    maxPriorityFeeSuggestions: {
      fast: gweiToWei(boundedFastMaxPriorityFee),
      normal: gweiToWei(boundedNormalPriorityFee),
      urgent: gweiToWei(boundedUrgentPriorityFee),
    },
  };
};

export const suggestFees = async (
  provider: JsonRpcProvider
): Promise<Suggestions> => {
  const {
    baseFeeSuggestion,
    baseFeeTrend,
    currentBaseFee,
    blocksToConfirmationByBaseFee,
  } = await suggestMaxBaseFee(provider);
  const {
    maxPriorityFeeSuggestions,
    confirmationTimeByPriorityFee,
    blocksToConfirmationByPriorityFee,
  } = await suggestMaxPriorityFee(provider);
  return {
    baseFeeSuggestion,
    baseFeeTrend,
    blocksToConfirmationByBaseFee,
    blocksToConfirmationByPriorityFee,
    confirmationTimeByPriorityFee,
    currentBaseFee,
    maxPriorityFeeSuggestions,
  };
};
