
const { applyOperator } = require("../utils/helpers");
const logger = require("../utils/logger");


function evaluateRules(rules, data) {
  const ruleTrace = [];

  for (const rule of rules) {
    const fieldValue = data[rule.field];

    // if the field doesn't exist in the input data
    if (fieldValue === undefined || fieldValue === null) {
      const traceEntry = {
        field: rule.field,
        operator: rule.operator,
        expectedValue: rule.value,
        actualValue: "MISSING",
        passed: false,
        reason: `Required field "${rule.field}" was not provided in the request`
      };
      ruleTrace.push(traceEntry);
      logger.warn(`Rule failed: field "${rule.field}" is missing from input`);
      return { passed: false, failedRule: rule, ruleTrace };
    }

    const passed = applyOperator(fieldValue, rule.operator, rule.value);

    const traceEntry = {
      field: rule.field,
      operator: rule.operator,
      expectedValue: rule.value,
      actualValue: fieldValue,
      passed,
      reason: passed ? "Rule passed" : rule.reason
    };

    ruleTrace.push(traceEntry);

    if (!passed) {
      logger.info(`Rule failed: ${rule.field} ${rule.operator} ${rule.value} (actual: ${fieldValue})`);
      return { passed: false, failedRule: rule, ruleTrace };
    }
  }

  return { passed: true, ruleTrace };
}

module.exports = { evaluateRules };
