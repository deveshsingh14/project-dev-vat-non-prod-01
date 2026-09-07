// Generic request-body validator: pass it a Zod schema, get back
// middleware that 400s with a clear message on bad input, or replaces
// req.body with the validated (and type-coerced) data on success.
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };
