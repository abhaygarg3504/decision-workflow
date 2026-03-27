const { getWorkflow } = require("../config/workflowConfig");
const { evaluateRules } = require("./ruleEngine");
const stateService = require("./stateService");
const auditService = require("./auditService");
const { withRetry } = require("./retryService");
const { executeExternalAction } = require("../external/mockService");
const { safeSnapshot } = require("../utils/helpers");
const logger = require("../utils/logger");

async function executeWorkflow(workflowType, inputData) {
  const workflowDef = getWorkflow(workflowType);

  logger.info(`Starting workflow execution`, { type: workflowType });
  const instance = await stateService.createWorkflowInstance(workflowType, inputData);
  const workflowId = instance.id;
  await stateService.transitionStatus(workflowId, "pending", "in_progress", "Workflow execution started");
  for (const step of workflowDef.steps) {
    logger.info(`Executing step: ${step.name}`, { workflowId });

    // evaluate rules (if any exist for this step) 
    if (step.rules && step.rules.length > 0) {
      const { passed, failedRule, ruleTrace } = evaluateRules(step.rules, inputData);

      if (!passed) {
        const outcome = failedRule.onFailure; // REJECT | MANUAL_REVIEW | RETRY

        await auditService.logStepResult({
          workflowId,
          stepName: step.name,
          rulesApplied: ruleTrace,
          inputUsed: safeSnapshot(inputData),
          result: outcome,
          reason: failedRule.reason
        });

        const statusMap = {
          REJECT: "rejected",
          MANUAL_REVIEW: "manual_review",
          RETRY: "retry_pending"
        };

        const newStatus = statusMap[outcome] || "rejected";
        await stateService.transitionStatus(workflowId, "in_progress", newStatus, failedRule.reason);

        return buildResult(workflowId, newStatus, outcome, failedRule.reason, workflowId);
      }

      await auditService.logStepResult({
        workflowId,
        stepName: step.name,
        rulesApplied: ruleTrace,
        inputUsed: safeSnapshot(inputData),
        result: "SUCCESS",
        reason: "All rules in this step passed"
      });
    }

    // external action if this step requires it 
    if (step.action) {
      try {
        const actionResult = await withRetry(
          () => executeExternalAction(step.action, inputData),
          3,   
          300  
        );

        await auditService.logStepResult({
          workflowId,
          stepName: step.name,
          rulesApplied: [],
          inputUsed: safeSnapshot(inputData),
          result: "SUCCESS",
          reason: `External action "${step.action}" completed successfully`
        });

        logger.info(`External action "${step.action}" succeeded`, { workflowId, actionResult });

      } catch (actionError) {
        await auditService.logStepResult({
          workflowId,
          stepName: step.name,
          rulesApplied: [],
          inputUsed: safeSnapshot(inputData),
          result: "RETRY",
          reason: `External dependency failed after retries: ${actionError.message}`
        });

        await stateService.transitionStatus(
          workflowId,
          "in_progress",
          "retry_pending",
          `External action "${step.action}" failed: ${actionError.message}`
        );

        return buildResult(
          workflowId,
          "retry_pending",
          "RETRY",
          `External service unavailable. Request queued for retry.`,
          workflowId
        );
      }
    }
  }

  await stateService.transitionStatus(
    workflowId,
    "in_progress",
    "approved",
    "All workflow steps completed successfully"
  );

  logger.info(`Workflow approved`, { workflowId });

  return buildResult(workflowId, "approved", "APPROVED", "All checks passed. Request approved.", workflowId);
}

function buildResult(workflowId, dbStatus, engineOutcome, reason) {
  return {
    workflowId,
    status: dbStatus,
    outcome: engineOutcome,
    reason,
    timestamp: new Date().toISOString()
  };
}

module.exports = { executeWorkflow };
