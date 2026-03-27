

const workflows = {
  // loan approval
  loan_approval: {
    description: "Evaluates loan applications based on salary and credit score",
    steps: [
      {
        name: "salary_check",
        description: "Minimum salary threshold check",
        rules: [
          {
            field: "salary",
            operator: ">=",
            value: 30000,
            onFailure: "REJECT",
            reason: "Applicant salary is below the minimum required threshold of 30,000"
          }
        ]
      },
      {
        name: "credit_score_check",
        description: "Credit score evaluation — borderline scores go to manual review",
        rules: [
          {
            field: "creditScore",
            operator: ">=",
            value: 750,
            onFailure: "MANUAL_REVIEW",
            reason: "Credit score is below 750; flagging for manual underwriter review"
          }
        ]
      },
      {
        name: "document_verification",
        description: "External document verification via third-party service",
        action: "verifyDocument",  
        rules: []
      }
    ]
  },

  //  Insurance claim processing 
  claim_processing: {
    description: "Processes insurance claims with amount-based routing",
    steps: [
      {
        name: "claim_amount_check",
        description: "Auto-approve small claims; flag large ones",
        rules: [
          {
            field: "claimAmount",
            operator: "<=",
            value: 50000,
            onFailure: "MANUAL_REVIEW",
            reason: "Claim amount exceeds auto-approval limit; requires senior adjuster review"
          }
        ]
      },
      {
        name: "policy_active_check",
        description: "Ensure the policy is still active",
        rules: [
          {
            field: "policyActive",
            operator: "===",
            value: true,
            onFailure: "REJECT",
            reason: "Policy is not active; claim cannot be processed"
          }
        ]
      },
      {
        name: "external_fraud_check",
        description: "Run claim through external fraud detection API",
        action: "verifyDocument",
        rules: []
      }
    ]
  },

  // Employee onboarding 
  employee_onboarding: {
    description: "Validates new hire documents and department budget availability",
    steps: [
      {
        name: "age_eligibility_check",
        description: "Verify employee meets minimum age requirement",
        rules: [
          {
            field: "age",
            operator: ">=",
            value: 18,
            onFailure: "REJECT",
            reason: "Applicant does not meet minimum age requirement of 18 years"
          }
        ]
      },
      {
        name: "department_budget_check",
        description: "Ensure department has headcount budget available",
        rules: [
          {
            field: "budgetAvailable",
            operator: "===",
            value: true,
            onFailure: "MANUAL_REVIEW",
            reason: "Department budget is not confirmed; escalating to HR manager"
          }
        ]
      },
      {
        name: "background_verification",
        description: "Trigger external background check API",
        action: "verifyDocument",
        rules: []
      }
    ]
  },

  // vendor approval 
  vendor_approval: {
    description: "Approves vendors based on compliance and credit rating",
    steps: [
      {
        name: "compliance_check",
        description: "Verify vendor has valid compliance certifications",
        rules: [
          {
            field: "complianceCertified",
            operator: "===",
            value: true,
            onFailure: "REJECT",
            reason: "Vendor does not hold required compliance certifications"
          }
        ]
      },
      {
        name: "credit_rating_check",
        description: "Vendor credit rating must meet threshold",
        rules: [
          {
            field: "creditRating",
            operator: ">=",
            value: 7,
            onFailure: "MANUAL_REVIEW",
            reason: "Vendor credit rating is below acceptable threshold; needs procurement review"
          }
        ]
      }
    ]
  }

};

// return workflow by type
function getWorkflow(type) {
  const workflow = workflows[type];
  if (!workflow) {
    throw new Error(
      `Unknown workflow type: "${type}". Available types: ${Object.keys(workflows).join(", ")}`
    );
  }
  return workflow;
}

// return all workflows
function getAvailableWorkflowTypes() {
  return Object.keys(workflows);
}

module.exports = { getWorkflow, getAvailableWorkflowTypes, workflows };
