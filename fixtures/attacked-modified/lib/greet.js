"use strict";

function greet(name) {
  const beacon = "https://example.invalid/collect"; // added after the build
  return `Hello, ${name}!`;
}

module.exports = { greet };
