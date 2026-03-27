# Workflow Decision Engine

A configurable, production-grade workflow decision platform that processes structured business requests through rule evaluation, multi-step execution, state lifecycle management, full auditability, and resilient failure handling — all without code rewrites when requirements change.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Configuration Model](#configuration-model)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Failure Handling & Idempotency](#failure-handling--idempotency)
- [Auditability & Decision Explanation](#auditability--decision-explanation)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Decision Explanation Examples](#decision-explanation-examples)
- [Trade-off Defence](#trade-off-defence)
- [Scaling Considerations](#scaling-considerations)

---

## Overview

The Workflow Decision Engine is a **generic, configuration-driven platform** capable of handling real-world business workflows such as:

| Workflow | Description |
|---|---|
| `loan_approval` | Evaluates salary threshold, credit score, and document verification |
| `claim_processing` | Routes insurance claims by amount, validates policy status, runs fraud check |
| `employee_onboarding` | Checks age eligibility, department budget, and background verification |
| `vendor_approval` | Validates compliance certifications and vendor credit rating |

Adding a new workflow or changing a rule requires **zero code changes** — only a configuration update.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          REST API Layer                             │
│              POST /workflow/execute   GET /workflow/:id             │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                ┌───────────▼───────────┐
                │   Middleware Chain    │
                │  1. Validation (Joi)  │
                │  2. Idempotency Check │
                └───────────┬───────────┘
                            │
                ┌───────────▼───────────┐
                │  Workflow Controller  │
                └───────────┬───────────┘
                            │
          ┌─────────────────▼──────────────────────┐
          │            Workflow Engine              │
          │  ┌──────────────────────────────────┐  │
          │  │  Load workflow from Config        │  │
          │  │  For each step:                  │  │
          │  │    ├─ Evaluate Rules (RuleEngine) │  │
          │  │    │    PASS → next step          │  │
          │  │    │    FAIL → REJECT / REVIEW    │  │
          │  │    └─ Run External Action         │  │
          │  │         OK → next step            │  │
          │  │         FAIL → retry (w/ backoff) │  │
          │  └──────────────────────────────────┘  │
          └────────┬──────────────┬─────────────────┘
                   │              │
       ┌───────────▼──┐    ┌──────▼──────────┐
       │ State Service│    │  Audit Service  │
       │  (Prisma DB) │    │  (Prisma DB)    │
       └──────────────┘    └─────────────────┘
                   │              │
          ┌────────▼──────────────▼────────┐
          │         PostgreSQL             │
          │  WorkflowInstance              │
          │  StatusHistory                 │
          │  AuditLog                      │
          │  IdempotencyKey                │
          └────────────────────────────────┘
```

### Key Design Principles

- **Separation of Concerns**: Config, engine, state, audit, and external I/O are fully decoupled.
- **Configuration-Driven**: All workflow logic (steps, rules, operators, outcomes) lives in `workflowConfig.js`. The engine is logic-free about business rules.
- **Fail-Safe**: Every step outcome is persisted before the request returns. Partial failures are audited.
- **Idempotent**: Duplicate requests with the same `Idempotency-Key` return the cached response without re-executing.

---

## Project Structure

```
workflow-decision-engine/
├── prisma/
│   ├── migrations/          # Prisma migration history
│   └── schema.prisma        # DB models: WorkflowInstance, AuditLog, StatusHistory, IdempotencyKey
│
├── src/
│   ├── config/
│   │   └── workflowConfig.js       # ← All workflow definitions live here (CONFIGURABLE)
│   │
│   ├── controllers/
│   │   └── workflowController.js   # HTTP handlers — thin layer, delegates to services
│   │
│   ├── db/
│   │   └── prismaClient.js         # Singleton Prisma client
│   │
│   ├── external/
│   │   └── mockService.js          # Simulated external dependency (doc verify, fraud API)
│   │
│   ├── middleware/
│   │   ├── errorMiddleware.js      # Global error handler
│   │   ├── idempotencyMiddleware.js # Duplicate-request detection and caching
│   │   └── validationMiddleware.js # Joi schema validation on incoming requests
│   │
│   ├── routes/
│   │   └── workflowRoutes.js       # Express router
│   │
│   ├── services/
│   │   ├── auditService.js         # Writes AuditLog records; builds decision explanations
│   │   ├── retryService.js         # Exponential backoff retry wrapper
│   │   ├── ruleEngine.js           # Evaluates rules against input data
│   │   ├── stateService.js         # CRUD for WorkflowInstance and StatusHistory
│   │   └── workflowEngine.js       # Orchestrates step execution end-to-end
│   │
│   ├── utils/
│   │   ├── helpers.js              # applyOperator, safeSnapshot, sleep
│   │   └── logger.js               # Winston structured logger
│   │
│   └── server.js                   # Express app bootstrap + graceful shutdown
│
├── .env.example
├── package.json
└── README.md
```

---

## Core Components

### 1. `workflowConfig.js` — The Brain (Configuration Layer)

This is the **single source of truth** for all business logic. A workflow is defined as an ordered list of steps. Each step contains either:

- **Rules**: declarative field checks (`field`, `operator`, `value`, `onFailure`, `reason`)
- **Action**: a string key that maps to an external service call

```js
// Example: a single step with a rule
{
  name: "salary_check",
  rules: [{
    field: "salary",
    operator: ">=",
    value: 30000,
    onFailure: "REJECT",
    reason: "Salary below minimum threshold"
  }]
}

// Example: a step that calls an external service
{
  name: "document_verification",
  action: "verifyDocument",
  rules: []
}
```

**Supported operators**: `>`, `<`, `>=`, `<=`, `===`, `!==`

**Supported `onFailure` values**: `REJECT`, `MANUAL_REVIEW`, `RETRY`

To add a new workflow or change a rule: **edit only this file**. The engine requires no changes.

---

### 2. `workflowEngine.js` — The Orchestrator

Drives end-to-end execution for a given workflow type and input payload:

1. Loads the workflow definition from config
2. Creates a `WorkflowInstance` record (`status: pending`)
3. Transitions status to `in_progress`
4. For each step:
   - Runs `evaluateRules()` if rules exist → logs result via `auditService`
   - Runs `executeExternalAction()` with retry if `step.action` is set → logs result
   - On any failure, transitions status and returns early with the outcome
5. On full success, transitions to `approved` and returns

---

### 3. `ruleEngine.js` — Rule Evaluator

Stateless, pure function. Given a set of rules and an input object:

- Iterates rules in order
- Applies the operator using `applyOperator()`
- Returns `{ passed, failedRule, ruleTrace }` — the full trace is stored in the audit log

Missing fields are treated as failures with a descriptive reason, preventing silent data issues.

---

### 4. `stateService.js` — Lifecycle Manager

All state transitions are atomic using Prisma transactions:

```
pending → in_progress → approved
                      → rejected
                      → manual_review
                      → retry_pending
```

Every transition creates a `StatusHistory` record with `fromStatus`, `toStatus`, and a human-readable `reason`. This makes the full lifecycle queryable and auditable.

---

### 5. `auditService.js` — Decision Recorder

After every step — pass or fail — an `AuditLog` record is written containing:

- Step name and result
- Rules evaluated (with actual vs expected values)
- Snapshot of input data at that point in time
- Reason for the decision

`buildDecisionExplanation()` converts raw audit logs into a structured, human-readable explanation returned via the `GET /workflow/:id` endpoint.

---

### 6. `retryService.js` — Resilient Execution

Wraps external calls with exponential backoff:

```
Attempt 1 → wait ~300ms → Attempt 2 → wait ~600ms → Attempt 3 → give up
```

Random jitter (`+ Math.random() * 200ms`) is added to each wait to prevent thundering herd when multiple workflows retry simultaneously.

---

### 7. `idempotencyMiddleware.js` — Duplicate Prevention

If a request arrives with an `Idempotency-Key` header:

1. The middleware checks `IdempotencyKey` table in the DB
2. **Cache hit**: returns the stored response immediately — no workflow is re-executed
3. **Cache miss**: processes normally, then stores the response keyed to that header value

This guarantees at-most-once execution for retried client requests.

---

### 8. `mockService.js` — External Dependency Simulation

Simulates a third-party API (document verification, fraud detection, background check). It introduces random failures to test the retry path, making the system's resilience verifiable without real external dependencies.

---

## Data Flow

```
Client Request
    │
    ▼
POST /workflow/execute
    │
    ├─ [validationMiddleware] → 400 if type/data invalid
    ├─ [idempotencyMiddleware] → 200 (cached) if duplicate key
    │
    ▼
workflowController.executeWorkflowHandler()
    │
    ▼
workflowEngine.executeWorkflow(type, data)
    │
    ├─ stateService.createWorkflowInstance()      → DB: WorkflowInstance (pending)
    ├─ stateService.transitionStatus()            → DB: in_progress + StatusHistory row
    │
    ├─ [Step 1: Rules]
    │   ├─ ruleEngine.evaluateRules()
    │   ├─ auditService.logStepResult()           → DB: AuditLog
    │   └─ [on fail] stateService.transitionStatus() → DB: rejected/manual_review
    │
    ├─ [Step 2: External Action]
    │   ├─ retryService.withRetry(mockService)
    │   ├─ auditService.logStepResult()           → DB: AuditLog
    │   └─ [on fail] stateService.transitionStatus() → DB: retry_pending
    │
    └─ stateService.transitionStatus()            → DB: approved
    │
    ▼
Response: { workflowId, status, outcome, reason, timestamp }
```

---

## Configuration Model

### Adding a New Workflow

Open `src/config/workflowConfig.js` and add a new key to the `workflows` object:

```js
mortgage_approval: {
  description: "Full mortgage application evaluation",
  steps: [
    {
      name: "income_check",
      description: "Verify annual income meets threshold",
      rules: [
        {
          field: "annualIncome",
          operator: ">=",
          value: 60000,
          onFailure: "REJECT",
          reason: "Annual income below minimum mortgage threshold"
        }
      ]
    },
    {
      name: "ltv_ratio_check",
      description: "Loan-to-value ratio must be within safe limits",
      rules: [
        {
          field: "ltvRatio",
          operator: "<=",
          value: 80,
          onFailure: "MANUAL_REVIEW",
          reason: "LTV ratio exceeds 80%; requires underwriter sign-off"
        }
      ]
    },
    {
      name: "property_valuation",
      description: "Trigger external property valuation service",
      action: "verifyDocument",
      rules: []
    }
  ]
}
```

That's it. The new workflow is immediately available at `POST /workflow/execute` with `type: "mortgage_approval"`.

### Changing a Rule Threshold

To update the minimum credit score from 750 to 700 for loan approval:

```js
// workflowConfig.js — no engine code touched
{
  field: "creditScore",
  operator: ">=",
  value: 700,   // changed from 750
  onFailure: "MANUAL_REVIEW",
  reason: "Credit score below 700; flagging for manual review"
}
```

### Changing a Failure Outcome

To make a failing salary check trigger `MANUAL_REVIEW` instead of `REJECT`:

```js
onFailure: "MANUAL_REVIEW",   // was "REJECT"
reason: "Salary below threshold; flagging for HR review instead of auto-reject"
```

---

## API Reference

### `POST /workflow/execute`

Submits a workflow request for processing.

**Headers**

| Header | Required | Description |
|---|---|---|
| `Content-Type` | Yes | `application/json` |
| `Idempotency-Key` | No | Any unique string; prevents duplicate execution |

**Request Body**

```json
{
  "type": "loan_approval",
  "data": {
    "salary": 45000,
    "creditScore": 720,
    "applicantId": "APP-001"
  }
}
```

**Response**

```json
{
  "workflowId": "a1b2c3d4-...",
  "status": "manual_review",
  "outcome": "MANUAL_REVIEW",
  "reason": "Credit score is below 750; flagging for manual underwriter review",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Possible `outcome` values**

| Outcome | Description |
|---|---|
| `APPROVED` | All steps passed |
| `REJECT` | A hard rule failed |
| `MANUAL_REVIEW` | A soft rule failed; needs human review |
| `RETRY` | External dependency failed after all retry attempts |

---

### `GET /workflow/:id`

Retrieves full workflow state including status history and decision explanation.

**Response**

```json
{
  "workflowId": "a1b2c3d4-...",
  "type": "loan_approval",
  "status": "manual_review",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:01.200Z",
  "inputSnapshot": { "salary": 45000, "creditScore": 720 },
  "statusHistory": [
    { "fromStatus": "pending", "toStatus": "in_progress", "reason": "Workflow execution started" },
    { "fromStatus": "in_progress", "toStatus": "manual_review", "reason": "Credit score below 750..." }
  ],
  "decisionExplanation": [
    {
      "stepNumber": 1,
      "step": "salary_check",
      "decision": "SUCCESS",
      "reason": "All rules in this step passed",
      "rulesEvaluated": [
        { "field": "salary", "operator": ">=", "expectedValue": 30000, "actualValue": 45000, "passed": true }
      ]
    },
    {
      "stepNumber": 2,
      "step": "credit_score_check",
      "decision": "MANUAL_REVIEW",
      "reason": "Credit score is below 750; flagging for manual underwriter review",
      "rulesEvaluated": [
        { "field": "creditScore", "operator": ">=", "expectedValue": 750, "actualValue": 720, "passed": false }
      ]
    }
  ]
}
```

---

### `GET /workflow`

Lists workflows with optional filters.

**Query Parameters**

| Param | Description | Example |
|---|---|---|
| `type` | Filter by workflow type | `?type=loan_approval` |
| `status` | Filter by current status | `?status=manual_review` |

---

### `GET /workflow/types`

Returns all available workflow types.

```json
{
  "availableTypes": ["loan_approval", "claim_processing", "employee_onboarding", "vendor_approval"]
}
```

---

### `GET /health`

Health check endpoint.

```json
{
  "status": "ok",
  "service": "workflow-decision",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Database Schema

```
WorkflowInstance
  id              UUID (PK)
  workflowType    String        ← e.g. "loan_approval"
  status          String        ← current lifecycle state
  inputSnapshot   JSON          ← sanitized copy of input at submission time
  createdAt       DateTime
  updatedAt       DateTime
  
  auditLogs       AuditLog[]
  statusHistory   StatusHistory[]

AuditLog
  id              UUID (PK)
  workflowId      UUID (FK → WorkflowInstance)
  stepName        String
  rulesApplied    JSON          ← full rule trace with actual/expected values
  inputUsed       JSON
  result          String        ← SUCCESS | REJECT | MANUAL_REVIEW | RETRY
  reason          String?
  createdAt       DateTime

StatusHistory
  id              UUID (PK)
  workflowId      UUID (FK → WorkflowInstance)
  fromStatus      String
  toStatus        String
  reason          String?
  changedAt       DateTime

IdempotencyKey
  key             String (PK)   ← value of Idempotency-Key header
  workflowId      UUID
  response        JSON          ← full response body cached for replay
  createdAt       DateTime
```

---

## Failure Handling & Idempotency

### Rule Failure

When a rule fails, execution halts immediately. The failed rule's `onFailure` value determines the outcome (`REJECT`, `MANUAL_REVIEW`). The failure is logged to `AuditLog` and the status is transitioned atomically before the response is returned.

### External Dependency Failure

External actions (e.g. document verification) are wrapped in `withRetry()` with exponential backoff:

```
Attempt 1 → failure → wait ~300ms
Attempt 2 → failure → wait ~600ms
Attempt 3 → failure → give up → status: retry_pending
```

This prevents cascading failures from transient network issues.

### Missing Input Fields

If a required field is absent from the input data, the rule evaluator treats it as a failure with a descriptive message: `Required field "salary" was not provided in the request`. This prevents silent evaluation with wrong defaults.

### Duplicate Requests (Idempotency)

Send the same request twice with the same `Idempotency-Key` header:

- **First request**: executed normally, response cached in `IdempotencyKey` table
- **Second request**: middleware returns the cached response instantly, no DB writes, no workflow re-execution

The cached response includes `_idempotencyNote` to signal the cache hit to the client.

### Partial Save Failures

Status transitions use Prisma transactions — the `WorkflowInstance` status update and the `StatusHistory` insert are committed atomically. If either fails, neither is persisted.

---

## Auditability & Decision Explanation

Every workflow produces a complete, human-readable decision trail accessible at `GET /workflow/:id`. The `decisionExplanation` array shows, for each step:

- Which step ran and in what order
- What rules were evaluated, with **actual vs expected values**
- Whether the step passed or failed
- The exact reason for any failure
- The input data that was used at that point in time

This design supports regulatory compliance scenarios where decisions must be fully explainable (e.g. GDPR, financial services).

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (local or hosted, e.g. Supabase)

### Installation

```bash
# Clone the repo
git clone <repo-url>
cd workflow-decision-engine

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and DIRECT_URL

# Run database migrations
npm run db:migrate

# Start the development server
npm run dev
```

### Quick Test

```bash
# Health check
curl http://localhost:3000/health

# Submit a loan approval workflow
curl -X POST http://localhost:3000/workflow/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-001" \
  -d '{
    "type": "loan_approval",
    "data": {
      "salary": 45000,
      "creditScore": 720
    }
  }'

# Retrieve the workflow result and full audit trail
curl http://localhost:3000/workflow/<workflowId>

# List all workflows in manual_review
curl "http://localhost:3000/workflow?status=manual_review"
```

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Prisma connection string (pooled) | `postgresql://user:pass@host:5432/db?pgbouncer=true` |
| `DIRECT_URL` | Direct Postgres URL for migrations | `postgresql://user:pass@host:5432/db` |
| `PORT` | Port to run the server on | `3000` |
| `NODE_ENV` | Environment (`development` / `production`) | `development` |
| `LOG_LEVEL` | Winston log level | `info` |

---

## Testing

### Test Scenarios

| Scenario | How to Test |
|---|---|
| **Happy path** | Submit valid data for any workflow type; expect `approved` |
| **Hard reject** | Submit `salary: 10000` to `loan_approval`; expect `rejected` |
| **Soft reject** | Submit `creditScore: 600` (salary passing) to `loan_approval`; expect `manual_review` |
| **Missing field** | Omit `salary` entirely; expect failure with "Required field" reason |
| **Invalid type** | Submit `type: "foo_workflow"`; expect 400 validation error |
| **Duplicate request** | Send same request twice with same `Idempotency-Key`; second response has `_idempotencyNote` |
| **External failure + retry** | `mockService` randomly fails; engine retries up to 3 times before `retry_pending` |
| **Rule change** | Update `creditScore` threshold in config; re-run same payload; observe different outcome |
| **Audit trail** | After any run, `GET /workflow/:id`; verify `decisionExplanation` matches input |

### Example Test Payloads

**Loan Approval — Approved**
```json
{ "type": "loan_approval", "data": { "salary": 50000, "creditScore": 800 } }
```

**Loan Approval — Rejected (salary)**
```json
{ "type": "loan_approval", "data": { "salary": 20000, "creditScore": 800 } }
```

**Loan Approval — Manual Review (credit score)**
```json
{ "type": "loan_approval", "data": { "salary": 50000, "creditScore": 700 } }
```

**Claim Processing — Auto-Approved**
```json
{ "type": "claim_processing", "data": { "claimAmount": 10000, "policyActive": true } }
```

**Claim Processing — Manual Review (large claim)**
```json
{ "type": "claim_processing", "data": { "claimAmount": 75000, "policyActive": true } }
```

**Claim Processing — Rejected (inactive policy)**
```json
{ "type": "claim_processing", "data": { "claimAmount": 10000, "policyActive": false } }
```

**Employee Onboarding — Approved**
```json
{ "type": "employee_onboarding", "data": { "age": 25, "budgetAvailable": true } }
```

**Vendor Approval — Manual Review (low credit rating)**
```json
{ "type": "vendor_approval", "data": { "complianceCertified": true, "creditRating": 5 } }
```

---

## Decision Explanation Examples

### Example 1: Loan Approved

**Input**: `{ "salary": 50000, "creditScore": 800 }`

**`decisionExplanation`**:
```json
[
  {
    "stepNumber": 1,
    "step": "salary_check",
    "decision": "SUCCESS",
    "reason": "All rules in this step passed",
    "rulesEvaluated": [
      { "field": "salary", "operator": ">=", "expectedValue": 30000, "actualValue": 50000, "passed": true }
    ]
  },
  {
    "stepNumber": 2,
    "step": "credit_score_check",
    "decision": "SUCCESS",
    "reason": "All rules in this step passed",
    "rulesEvaluated": [
      { "field": "creditScore", "operator": ">=", "expectedValue": 750, "actualValue": 800, "passed": true }
    ]
  },
  {
    "stepNumber": 3,
    "step": "document_verification",
    "decision": "SUCCESS",
    "reason": "External action \"verifyDocument\" completed successfully"
  }
]
```

**Final outcome**: `APPROVED`

---

### Example 2: Loan — Manual Review

**Input**: `{ "salary": 50000, "creditScore": 700 }`

**`decisionExplanation`**:
```json
[
  {
    "stepNumber": 1,
    "step": "salary_check",
    "decision": "SUCCESS",
    "reason": "All rules in this step passed",
    "rulesEvaluated": [
      { "field": "salary", "operator": ">=", "expectedValue": 30000, "actualValue": 50000, "passed": true }
    ]
  },
  {
    "stepNumber": 2,
    "step": "credit_score_check",
    "decision": "MANUAL_REVIEW",
    "reason": "Credit score is below 750; flagging for manual underwriter review",
    "rulesEvaluated": [
      { "field": "creditScore", "operator": ">=", "expectedValue": 750, "actualValue": 700, "passed": false }
    ]
  }
]
```

**Final outcome**: `MANUAL_REVIEW` — execution halted at step 2.

---

### Example 3: Claim — Rejected (Inactive Policy)

**Input**: `{ "claimAmount": 10000, "policyActive": false }`

**`decisionExplanation`**:
```json
[
  {
    "stepNumber": 1,
    "step": "claim_amount_check",
    "decision": "SUCCESS",
    "reason": "All rules in this step passed"
  },
  {
    "stepNumber": 2,
    "step": "policy_active_check",
    "decision": "REJECT",
    "reason": "Policy is not active; claim cannot be processed",
    "rulesEvaluated": [
      { "field": "policyActive", "operator": "===", "expectedValue": true, "actualValue": false, "passed": false }
    ]
  }
]
```

**Final outcome**: `REJECT`

---

## Trade-off Defence

| Decision | Chosen Approach | Alternative | Why |
|---|---|---|---|
| **Config format** | JS object in `workflowConfig.js` | JSON file / DB table | Code-level config allows expressions and comments; DB config adds real-time edits but adds infra complexity and race conditions |
| **Rule evaluation** | Sequential, fail-fast | Evaluate all rules | Fail-fast mirrors real underwriting: early rejections save external API calls and cost |
| **State storage** | PostgreSQL via Prisma | Redis / in-memory | Durable, queryable, transactional; in-memory would not survive restarts |
| **Idempotency** | DB-persisted key-value | In-memory cache | Survives restarts; consistent across multiple server instances |
| **External simulation** | Random-failure mock | Real HTTP client | Keeps the engine testable without credentials; swap `mockService.js` to go live |
| **Audit logging** | Write per-step in-flow | Batch/async write | Synchronous writes guarantee audit completeness even if process crashes mid-workflow |
| **Retry strategy** | Exponential backoff + jitter | Fixed delay | Reduces thundering herd; jitter prevents retry storms under load |
| **Operator evaluation** | `switch` in `applyOperator()` | `eval()` / dynamic | Safe, predictable, and auditable; `eval()` is a security risk |

---

## Scaling Considerations

### Current Bottlenecks

- **Single-instance server**: All requests processed synchronously on one Node.js process.
- **Synchronous external calls**: Each workflow request blocks while waiting for external actions.

### Horizontal Scaling Path

**1. Stateless API nodes**  
The engine reads config at startup and writes all state to PostgreSQL. Multiple API replicas can run behind a load balancer without shared in-process state. Idempotency keys in the DB prevent double-processing.

**2. Async workflow execution via message queue**  
For long-running workflows, the POST endpoint enqueues the job and returns a `workflowId` immediately. Workers pick up jobs from the queue (e.g. BullMQ, AWS SQS), execute steps, and write results to the DB. Clients poll `GET /workflow/:id` for status.

```
Client → POST /execute → enqueue job → 202 Accepted { workflowId }
Worker → dequeue → executeWorkflow() → write DB
Client → GET /workflow/:id → { status: "approved" }
```

**3. Database connection pooling**  
Use PgBouncer or Supabase's built-in pooler (already supported via `DIRECT_URL` / `DATABASE_URL` split in the schema) to handle connection limits under high load.

**4. Retry queue**  
Workflows in `retry_pending` status can be picked up by a scheduled job (cron or queue consumer) rather than blocking the original request thread.

**5. Config hot-reload**  
For teams that update workflow config frequently, move definitions to a DB-backed config store with a cache layer. Changes take effect on next cache TTL expiry without a deployment.

**6. Observability**  
Add distributed tracing (OpenTelemetry) and expose a Prometheus metrics endpoint. Key metrics: workflow throughput by type, step failure rates, external action latency P95, retry rates.
