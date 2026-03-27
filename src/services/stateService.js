
const prisma = require("../db/prismaClient");
const { safeSnapshot } = require("../utils/helpers");
const logger = require("../utils/logger");

async function createWorkflowInstance(workflowType, inputData) {
  const instance = await prisma.workflowInstance.create({
    data: {
      workflowType,
      status: "pending",
      inputSnapshot: safeSnapshot(inputData)
    }
  });

  logger.info(`Workflow instance created`, { workflowId: instance.id, type: workflowType });
  return instance;
}

async function transitionStatus(workflowId, currentStatus, newStatus, reason) {
  const [updated] = await prisma.$transaction([
    prisma.workflowInstance.update({
      where: { id: workflowId },
      data: { status: newStatus }
    }),
    prisma.statusHistory.create({
      data: {
        workflowId,
        fromStatus: currentStatus,
        toStatus: newStatus,
        reason: reason || null
      }
    })
  ]);

  logger.info(`Status transition: ${currentStatus} → ${newStatus}`, { workflowId, reason });
  return updated;
}
async function getWorkflowById(workflowId) {
  return prisma.workflowInstance.findUnique({
    where: { id: workflowId },
    include: {
      auditLogs: { orderBy: { createdAt: "asc" } },
      statusHistory: { orderBy: { changedAt: "asc" } }
    }
  });
}
async function listWorkflows(filters = {}) {
  const where = {};
  if (filters.type) where.workflowType = filters.type;
  if (filters.status) where.status = filters.status;

  return prisma.workflowInstance.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: { select: { auditLogs: true } }
    }
  });
}

module.exports = {
  createWorkflowInstance,
  transitionStatus,
  getWorkflowById,
  listWorkflows
};
