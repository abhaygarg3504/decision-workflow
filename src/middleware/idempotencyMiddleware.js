const prisma = require("../db/prismaClient");
const logger = require("../utils/logger");

async function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.headers["idempotency-key"];
  if (!idempotencyKey) {
    return next();
  }

  try {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey }
    });

    if (existing) {
      logger.info(`Idempotency cache hit`, { key: idempotencyKey, workflowId: existing.workflowId });

      return res.status(200).json({
        ...existing.response,
        _idempotencyNote: "This response was returned from cache (duplicate request detected)"
      });
     }
      req.idempotencyKey = idempotencyKey;
    next();

  } catch (error) {
    logger.error("Idempotency middleware DB error, proceeding without cache check", {
      error: error.message
    });
    next();
  }
}

async function saveIdempotencyResponse(key, workflowId, response) {
  if (!key) return;

  try {
    await prisma.idempotencyKey.upsert({
      where: { key },
      create: { key, workflowId, response },
      update: {} 
    });
  } catch (error) {
    logger.warn("Could not save idempotency key", { key, error: error.message });
  }
}

module.exports = { idempotencyMiddleware, saveIdempotencyResponse };
