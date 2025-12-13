# Repository Guidelines

Use this guide to keep contributions consistent with the Agentic Design Patterns project.

## Project Structure & Modules
- `src/`: TypeScript chapter demos scripts plus `config.ts` for env parsing and `prompts/` for prompt assets.
- `code/`: Python equivalents for several chapters; mirror naming (`ch0X_*.py`).
- `dist/`: Compiled JS output from `npm run build`; do not edit by hand.
- `notebooks/`: Exploratory notebooks; keep outputs trimmed.

## Setup, Build, and Run
- Install deps: `npm install --legacy-peer-deps` (required for current peer constraints).
- Type-check/build: `npm run build` (emits to `dist/`).
- Lint/format: `npm run lint` for ESLint + Prettier check, `npm run lint:fix` and `npm run format` to autofix, `npm run format:check` for CI-style verification.
- Demos: `npm run demo1` … `npm run demo11` or `tsx src/ch03_parallelization.ts` to run a specific chapter script. These scripts expect relevant API keys in `.env`.
- Tests: `npm test` is a placeholder; add targeted checks alongside new features.

## Coding Style & Naming Conventions
- Language: TypeScript ES modules. Prefer the existing chapter file pattern `chNN_topic.ts`; keep Python analogs aligned.
- Formatting: Prettier defaults (2-space indent, semicolons, double quotes). Let Prettier handle spacing/quotes; avoid manual deviations.
- Linting: ESLint is type-aware; unused variables are errors, but `any` usage is permitted where needed. Keep imports ordered logically and remove dead code.
- Config: Use `.env` with `config.ts` schema (`NODE_ENV`, `OPENAI_API_KEY`, `XAI_API_KEY`, `TAVILY_API_KEY`, `ANTHROPIC_API_KEY`, `SERVER_PORT`). Never commit secrets.

## Testing Guidelines
- No formal suite yet; treat chapter demos as smoke tests. When adding functionality, include lightweight checks (e.g., assertions or small harness scripts) near the module being changed.
- Keep test names explicit about the scenario and the agent pattern being exercised.

## Commit & Pull Request Guidelines
- Commit messages follow short, imperative summaries (e.g., `add mcp client`, `refactor prompts`); keep scope narrow.
- PRs should include: purpose and scope, commands run (`npm run lint`, relevant demo), and any setup notes (env vars, new files). Add screenshots or logs when behavior changes.

## Security & Configuration Tips
- Store API keys only in `.env`/local secrets; do not print them in logs. Validate required keys at startup via `config.ts`.
- If adding new external tools/APIs, document required env vars and expected rate limits in the relevant chapter file header.
