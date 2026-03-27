# Configurable Workflow Decision Platform

## Objective
Build a configurable workflow decision platform capable of handling real-world business workflows under ambiguity, changing requirements, and operational constraints. AI tools may assist with coding, but engineering judgement, architecture design, and reasoning will determine the final evaluation.

## Problem Statement
Build a Configurable Workflow Decision Platform that processes incoming requests, evaluates rules, executes workflow stages, maintains state, records audit trails, and handles failures and retries. The system should be generic enough to support multiple business use cases via configuration.

## Example Use Cases
- Application approval workflow
- Claim processing workflow
- Employee onboarding workflow
- Vendor approval workflow
- Document verification workflow

## Core Capabilities Required
- **Input intake**: accept structured request and validate schema
- **Rules evaluation**: mandatory checks, threshold checks, conditional branching, multi-step evaluation
- **Workflow execution**: success, reject, retry, and manual review stages
- **State management**: lifecycle tracking and full change history
- **Auditability**: explainable decisions with rule trace and data reference
- **Failure handling**: dependency failures, partial save failures, duplicate requests, retries and idempotency
- **Configurability**: workflows and rules should be changeable without major code rewrites

## Architecture Overview

### System Components

The platform is built using Node.js with Express.js and follows a modular architecture with clear separation of concerns:

```
src/
├── server.js                 # Main application entry point
├── config/
│   └── workflowConfig.js     # Workflow and rule definitions
├── controllers/
│   └── workflowController.js # HTTP request handlers
├── db/
│   └── prismaClient.js       # Database client initialization
├── external/
│   └── mockService.js        # External dependency simulation
├── middleware/
│   ├── errorMiddleware.js    # Error handling middleware
│   ├── idempotencyMiddleware.js # Duplicate request prevention
│   └── validationMiddleware.js   # Request validation
├── routes/
│   └── workflowRoutes.js     # API route definitions
├── services/
│   ├── auditService.js       # Audit logging and decision explanation
│   ├── retryService.js       # Retry logic for external calls
│   ├── ruleEngine.js         # Rule evaluation engine
│   ├── stateService.js       # Workflow state management
│   └── workflowEngine.js     # Main workflow execution orchestrator
└── utils/
    ├── helpers.js            # Utility functions
    └── logger.js             # Logging configuration
```

### Data Flow

1. **Request Intake**: HTTP request arrives at `/workflow/execute` endpoint
2. **Validation**: Request is validated for schema compliance and workflow type
3. **Idempotency Check**: Prevents duplicate processing using idempotency keys
4. **Workflow Creation**: New workflow instance created in database with input snapshot
5. **Step Execution**: Each workflow step is processed sequentially:
   - Rule evaluation (if rules exist)
   - External action execution (if action defined)
   - Audit logging for each step
6. **State Transitions**: Workflow status updated based on outcomes
7. **Response**: Result returned with workflow ID and decision

### Key Design Decisions

- **Configuration-Driven**: Workflows and rules defined in `workflowConfig.js` allow easy modification without code changes
- **Audit-First**: Every decision is logged with full context for explainability
- **Idempotent Operations**: Prevents duplicate processing and ensures consistency
- **Retry Mechanism**: Handles transient external service failures
- **State Machine**: Clear workflow lifecycle with status transitions
- **Modular Services**: Each concern (rules, state, audit) is isolated for maintainability

## Configuration Model

Workflows are configured in `src/config/workflowConfig.js` with the following structure:

```javascript
{
  workflow_type: {
    description: "Workflow description",
    steps: [
      {
        name: "step_name",
        description: "Step description",
        rules: [
          {
            field: "inputField",
            operator: ">=",
            value: 30000,
            onFailure: "REJECT",
            reason: "Failure reason message"
          }
        ],
        action: "externalActionName" // Optional external service call
      }
    ]
  }
}
```

### Supported Rule Operators
- `>=`, `<=`, `>`, `<` - Numeric comparisons
- `===`, `!==` - Exact equality
- String and boolean comparisons

### Available Workflows

1. **loan_approval**: Evaluates loan applications based on salary and credit score
2. **claim_processing**: Processes insurance claims with amount-based routing
3. **employee_onboarding**: Validates new hire documents and department budget
4. **vendor_approval**: Approves vendors based on compliance and credit rating

## API Interface

### Endpoints

#### POST /workflow/execute
Execute a workflow with input data.

**Request:**
```json
{
  "type": "loan_approval",
  "data": {
    "salary": 45000,
    "creditScore": 720
  },
  "idempotencyKey": "optional-unique-key"
}
```

**Response:**
```json
{
  "workflowId": "uuid",
  "status": "approved|rejected|manual_review|retry_pending",
  "outcome": "APPROVED|REJECTED|MANUAL_REVIEW|RETRY",
  "reason": "Decision explanation",
  "timestamp": "ISO date string"
}
```

#### GET /workflow/:id
Retrieve workflow details and decision explanation.

**Response:**
```json
{
  "workflowId": "uuid",
  "type": "loan_approval",
  "status": "approved",
  "createdAt": "ISO date",
  "updatedAt": "ISO date",
  "inputSnapshot": { ... },
  "statusHistory": [ ... ],
  "decisionExplanation": {
    "summary": "Workflow approved after passing all checks",
    "steps": [
      {
        "stepName": "salary_check",
        "result": "SUCCESS",
        "rulesApplied": [ ... ],
        "reason": "All rules passed"
      }
    ]
  }
}
```

#### GET /workflow
List workflows with optional filtering.

**Query Parameters:**
- `type`: Filter by workflow type
- `status`: Filter by status

#### GET /workflow/types
Get available workflow types.

## Database Schema

The system uses PostgreSQL with Prisma ORM:

- **WorkflowInstance**: Main workflow entity with status, input snapshot, and relationships
- **AuditLog**: Detailed logs of each step execution with rule traces
- **StatusHistory**: Complete status change history
- **IdempotencyKey**: Prevents duplicate request processing

## Testing Scenarios

### Happy Path
- Valid input passes all rules → APPROVED

### Invalid Input
- Missing required fields → 400 Validation Error
- Invalid workflow type → 400 Validation Error

### Duplicate Requests
- Same idempotency key → Returns cached result

### Dependency Failure
- External service fails → RETRY status with retry logic

### Retry Flow
- Failed external calls retried up to 3 times with exponential backoff

### Rule Change Scenarios
- Configuration updates applied without code changes
- New workflows added via configuration

## Decision Explanation Examples

### Approved Loan Application
```json
{
  "summary": "Loan application approved after passing all validation checks",
  "steps": [
    {
      "stepName": "salary_check",
      "result": "SUCCESS",
      "rulesApplied": [
        {
          "field": "salary",
          "operator": ">=",
          "expectedValue": 30000,
          "actualValue": 45000,
          "passed": true,
          "reason": "Rule passed"
        }
      ],
      "reason": "All rules in this step passed"
    },
    {
      "stepName": "credit_score_check",
      "result": "SUCCESS",
      "rulesApplied": [
        {
          "field": "creditScore",
          "operator": ">=",
          "expectedValue": 750,
          "actualValue": 720,
          "passed": false,
          "reason": "Credit score is below 750; flagging for manual underwriter review"
        }
      ],
      "reason": "All rules in this step passed"
    }
  ]
}
```

### Rejected Application
```json
{
  "summary": "Application rejected due to insufficient salary",
  "steps": [
    {
      "stepName": "salary_check",
      "result": "REJECT",
      "rulesApplied": [
        {
          "field": "salary",
          "operator": ">=",
          "expectedValue": 30000,
          "actualValue": 25000,
          "passed": false,
          "reason": "Applicant salary is below the minimum required threshold of 30,000"
        }
      ],
      "reason": "Applicant salary is below the minimum required threshold of 30,000"
    }
  ]
}
```

## Setup and Installation

1. **Prerequisites**
   - Node.js 16+
   - PostgreSQL database
   - npm or yarn

2. **Installation**
   ```bash
   npm install
   ```

3. **Database Setup**
   ```bash
   # Generate Prisma client
   npm run db:generate

   # Run migrations
   npm run db:migrate

   # Optional: Open Prisma Studio
   npm run db:studio
   ```

4. **Environment Variables**
   Create `.env` file:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/workflow_db"
   DIRECT_URL="postgresql://user:password@localhost:5432/workflow_db"
   PORT=3000
   ```

5. **Start Server**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## Scaling Considerations

- **Database**: PostgreSQL with proper indexing on workflow type and status
- **Horizontal Scaling**: Stateless application servers behind load balancer
- **External Dependencies**: Circuit breaker pattern for external service calls
- **Caching**: Redis for idempotency key storage at scale
- **Async Processing**: Queue-based processing for high-throughput workflows
- **Monitoring**: Comprehensive logging and metrics collection

## Deliverables

-  Working runnable implementation with README
- Architecture document explaining system design, components, data flow, trade-offs, and assumptions
- Configuration model demonstrating how workflows and rules are configurable
- API interface via REST API
- Test coverage for happy path, invalid input, duplicate requests, dependency failure, retry flow, and rule change scenarios
- Decision explanation examples showing input, rules triggered, output, and audit reasoning

## Constraints

- System must tolerate requirement changes
- Simulate at least one external dependency
- System must support idempotency
- Provide full audit logs
- Workflow must be configurable without large code rewrite
- Document scaling considerations

## Trade-off Analysis

### Configuration vs. Code
**Decision**: Configuration-driven workflows instead of hardcoded logic
**Rationale**: Enables business users to modify workflows without developer intervention
**Trade-off**: Slightly more complex initial setup vs. long-term maintainability

### Synchronous Processing vs. Async
**Decision**: Synchronous workflow execution for simplicity
**Rationale**: Most workflows complete quickly; async adds complexity
**Trade-off**: Request timeout limits vs. simpler architecture

### Single Database Transaction vs. Eventual Consistency
**Decision**: Immediate consistency within workflow execution
**Rationale**: Critical for audit accuracy and decision integrity
**Trade-off**: Potential lock contention vs. guaranteed consistency

### Comprehensive Audit vs. Performance
**Decision**: Full audit logging on every step
**Rationale**: Essential for compliance and debugging
**Trade-off**: Storage and query performance vs. complete traceability