# Gemini CLI - AI Context & Guidelines

This file outlines the coding standards, architectural patterns, and context for this project. All AI assistants and developers should adhere strictly to these rules.

## 1. Project Overview
* **Name:** agentic design patterns
* **Language:** TypeScript (Node.js environment)

## 2. Critical Coding Conventions
* **The most important rule for this project is common typescript standards.**
* Use 2 spaces for indentation.
* Prefix interface names with `I` (for example, `IUserService`).
* Always use strict equality (`===` and `!==`).

### Naming Conventions
* **Variables:** Must be `camelCase`. No `snake_case` or `PascalCase` for local variables.
* **Functions:** Must be `camelCase` for local functions, `PascalCase` for exported functions.
* **Class Properties:** Must be `camelCase` for local class, `PascalCase` for exported classed.
* **Filenames:** Use `snake_case` for file names.

## 3. Project Structure
* src/ - Source code
  * utils/ - Helper functions (must use camelCase naming)
  * types/ - TypeScript interfaces and types
  * prompts/ - Files in yaml format for different prompts

* dist/ - Compiled JavaScript output

## 4. Implementation Guidelines
* Async/Await: Prefer async/await over raw .then() chains.
* Prefer arrow functions
* Typing: Avoid any. Use explicit interfaces or types.
* Error Handling: Use try/catch blocks for all async operations and ensure user-friendly error messages are printed to the console.