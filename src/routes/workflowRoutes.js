const express = require("express");
const router = express.Router();

const {
  executeWorkflowHandler,
  getWorkflowHandler,
  listWorkflowsHandler,
  getWorkflowTypesHandler
} = require("../controllers/workflowController");

const { validateExecuteRequest } = require("../middleware/validationMiddleware");
const { idempotencyMiddleware } = require("../middleware/idempotencyMiddleware");

router.get("/types", getWorkflowTypesHandler);

router.get("/", listWorkflowsHandler);

router.post("/execute", validateExecuteRequest, idempotencyMiddleware, executeWorkflowHandler);

router.get("/:id", getWorkflowHandler);

module.exports = router;
