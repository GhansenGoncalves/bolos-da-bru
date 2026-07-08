"use strict";

// Express 4 não repassa rejeições de handlers async para o middleware de
// erro sozinho — este wrapper garante que qualquer throw/reject vire next(err).
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
