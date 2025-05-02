async function retryWithBackoff(operation, options = {}) {
  const {
    retries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
  } = options;

  let attempt = 0;
  let currentDelay = initialDelay;

  while (attempt < retries) {
    try {
      return await operation();
    } catch (error) {
      attempt++;

      if (attempt >= retries) {
        throw error;
      }

      const delay = Math.min(currentDelay, maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
      currentDelay *= factor;
    }
  }

  throw new Error('Max retries reached without success');
}

module.exports = { retryWithBackoff };
