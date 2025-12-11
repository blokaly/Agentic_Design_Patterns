import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] }, // Ignore built files and deps
  js.configs.recommended, // Base JS rules
  ...tseslint.configs.recommended, // TypeScript recommended rules
  {
    rules: {
      // Completely turn off every rule that complains about `any`
      "@typescript-eslint/no-explicit-any": "off", // allows `any` type
      "@typescript-eslint/no-unsafe-assignment": "off", // allows assigning `any` to anything
      "@typescript-eslint/no-unsafe-call": "off", // allows calling methods on `any`
      "@typescript-eslint/no-unsafe-member-access": "off", // allows `.foo` on `any`
      "@typescript-eslint/no-unsafe-argument": "off", // allows passing `any` as argument
      "@typescript-eslint/no-unsafe-return": "off", // allows returning `any`
      "no-implicit-any": "off", // old core rule (rarely used now)
      "@typescript-eslint/no-implicit-any": "off", // just in case

      // Optional: also silence the "prefer explicit type" warnings
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json", // Enables type-aware linting
      },
    },
    files: ["**/*.ts", "**/*.tsx"], // Only lint TS files
  },
  {
    rules: {
      // Customize rules here, e.g., enforce stricter typing
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/explicit-function-return-type": "warn", // Optional: Enforce return types
    },
  },
  prettierConfig, // Disables ESLint formatting rules
  {
    plugins: {
      prettier,
    },
    rules: {
      "prettier/prettier": "error", // Enforces Prettier as a rule
      // ... other rules
    },
  },
);
