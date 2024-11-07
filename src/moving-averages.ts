// moving-averages.ts

/**
 * Calculates the Exponential Moving Average (EMA) for a given array of numbers.
 *
 * @param values - An array of numbers representing the data points.
 * @param length - The number of periods over which to calculate the EMA.
 * @returns An array of numbers representing the EMA.
 *
 * @throws Will throw an error if `values` is not a non-empty array of numbers.
 * @throws Will throw an error if `length` is not a positive integer.
 */
export function ema(values: number[], length: number): number[] {
  // Input validation
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("The first argument must be a non-empty array of numbers.");
  }

  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("The length must be a positive integer.");
  }

  // Smoothing factor
  const k: number = 2 / (length + 1);
  const emaArray: number[] = [];

  // Initialize EMA with the first value
  emaArray[0] = values[0];

  // Calculate EMA for each subsequent value
  for (let i = 1; i < values.length; i++) {
    emaArray[i] = values[i] * k + emaArray[i - 1] * (1 - k);
  }

  return emaArray;
}
