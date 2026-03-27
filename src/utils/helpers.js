function applyOperator(fieldValue, operator, threshold) {
  switch (operator) {
    case ">":   return fieldValue > threshold;
    case "<":   return fieldValue < threshold;
    case ">=":  return fieldValue >= threshold;
    case "<=":  return fieldValue <= threshold;
    case "===": return fieldValue === threshold;
    case "!==": return fieldValue !== threshold;
    default:
      throw new Error(`Unsupported rule operator: "${operator}"`);
  }
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function safeSnapshot(data) {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return { _error: "Could not serialize input data" };
  }
}

module.exports = { applyOperator, sleep, safeSnapshot };
