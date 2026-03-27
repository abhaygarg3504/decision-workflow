const { executeWorkflow } = require("../services/workflowEngine");
const stateService = require("../services/stateService");
const auditService = require("../services/auditService");
const { saveIdempotencyResponse } = require("../middleware/idempotencyMiddleware");
const { getAvailableWorkflowTypes } = require("../config/workflowConfig");
const logger = require("../utils/logger");

async function executeWorkflowHandler(req, res, next) {
  const { type, data } = req.body;

  logger.info(`Incoming workflow request`, { type, idempotencyKey: req.idempotencyKey });

  try {
    const result = await executeWorkflow(type, data);

    if (req.idempotencyKey) {
      await saveIdempotencyResponse(req.idempotencyKey, result.workflowId, result);
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}


async function getWorkflowHandler(req, res, next) {
  const { id } = req.params;

  try {
    const workflow = await stateService.getWorkflowById(id);

    if (!workflow) {
      return res.status(404).json({ error: `Workflow with ID "${id}" not found` });
    }
    const decisionExplanation = auditService.buildDecisionExplanation(workflow.auditLogs);

    return res.status(200).json({
      workflowId: workflow.id,
      type: workflow.workflowType,
      status: workflow.status,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      inputSnapshot: workflow.inputSnapshot,
      statusHistory: workflow.statusHistory,
      decisionExplanation
    });
  } catch (error) {
    next(error);
  }
}

async function listWorkflowsHandler(req, res, next) {
  const { type, status } = req.query;

  try {
    const workflows = await stateService.listWorkflows({ type, status });

    return res.status(200).json({
      count: workflows.length,
      workflows
    });
  } catch (error) {
    next(error);
  }
}

function getWorkflowTypesHandler(req, res) {
  return res.status(200).json({
    availableTypes: getAvailableWorkflowTypes()
  });
}

module.exports = {
  executeWorkflowHandler,
  getWorkflowHandler,
  listWorkflowsHandler,
  getWorkflowTypesHandler
};
