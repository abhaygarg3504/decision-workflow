
const logger = require("../utils/logger");

async function verifyDocument(data) {
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

  if (Math.random() < 0.3) {
    logger.warn("External verification service is temporarily unavailable");
    throw new Error("External service unavailable: document verification failed");
  }

  logger.info("External verification service responded successfully");

  return {
    verified: true,
    verifiedAt: new Date().toISOString(),
    provider: "MockVerifyAPI v1.0"
  };
}
const externalActions = {
  verifyDocument
};

async function executeExternalAction(actionName, data) {
  const action = externalActions[actionName];
  if (!action) {
    throw new Error(`Unknown external action: "${actionName}". Check workflowConfig.js`);
  }
  return action(data);
}

module.exports = { executeExternalAction };
