
const { sleep } = require("../utils/helpers");
const logger = require("../utils/logger");
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 500) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        logger.info(`Operation succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        logger.error(`All ${maxAttempts} attempts failed. Giving up.`, { error: error.message });
        break;
      }

      // Exponential backoff
      const waitMs = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200;
      logger.warn(`Attempt ${attempt} failed. Retrying in ${Math.round(waitMs)}ms...`, {
        error: error.message
      });

      await sleep(waitMs);
    }
  }

  throw lastError;
}

module.exports = { withRetry };
