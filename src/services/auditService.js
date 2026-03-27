const prisma = require("../db/prismaClient");
const logger = require("../utils/logger");


async function logStepResult({ workflowId, stepName, rulesApplied, inputUsed, result, reason }) {
  await prisma.auditLog.create({
    data: {
      workflowId,
      stepName,
      rulesApplied: rulesApplied || [],
      inputUsed: inputUsed || {},
      result,
      reason: reason || null
    }
  });

  logger.info(`Audit recorded: step "${stepName}" → ${result}`, { workflowId, reason });
}


function buildDecisionExplanation(auditLogs) {
  return auditLogs.map((log, index) => ({
    stepNumber: index + 1,
    step: log.stepName,
    decision: log.result,
    reason: log.reason || "No specific reason recorded",
    rulesEvaluated: log.rulesApplied,
    dataSnapshot: log.inputUsed,
    timestamp: log.createdAt
  }));
}

module.exports = { logStepResult, buildDecisionExplanation };
