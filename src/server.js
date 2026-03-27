const express = require("express");
const workflowRoutes = require("./routes/workflowRoutes");
const { errorMiddleware } = require("./middleware/errorMiddleware");
const logger = require("./utils/logger");

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "workflow-decision",
    timestamp: new Date().toISOString()
  });
});

app.use("/workflow", workflowRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`
  });
});

app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Workflow Decision Engine running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`API base: http://localhost:${PORT}/workflow`);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down...");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

module.exports = server;