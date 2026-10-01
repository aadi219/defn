import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/test-results/**",
      "**/playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["scripts/**/*.ts", "**/*.config.{js,ts}", "packages/**/test/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage"],
    },
  },
  prettier,
);
