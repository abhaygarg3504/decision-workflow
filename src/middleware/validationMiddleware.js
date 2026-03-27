const Joi = require("joi");
const { getAvailableWorkflowTypes } = require("../config/workflowConfig");

function validateExecuteRequest(req, res, next) {
  const schema = Joi.object({
    type: Joi.string()
      .valid(...getAvailableWorkflowTypes())
      .required()
      .messages({
        "any.only": `Invalid workflow type. Valid types are: ${getAvailableWorkflowTypes().join(", ")}`,
        "string.empty": "Workflow type cannot be empty",
        "any.required": "Workflow type is required"
      }),
    data: Joi.object().required().messages({
      "object.base": "Request data must be a JSON object",
      "any.required": "Request data is required"
    })
  });

  const { error } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    return res.status(400).json({
      error: "Validation failed",
      details: error.details.map(d => d.message)
    });
  }

  next();
}

module.exports = { validateExecuteRequest };
