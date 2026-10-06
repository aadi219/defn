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
    files: [
      "scripts/**/*.ts",
      "apps/*/scripts/**/*.ts",
      "**/*.config.{js,ts}",
      "packages/**/test/**/*.ts",
      "apps/zotero/test/**/*.ts",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage"],
    },
  },
  {
    // Zotero bootstrap script: a classic script whose top-level functions Zotero calls.
    files: ["apps/zotero/addon/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { Zotero: "readonly", Services: "readonly" },
    },
    rules: { "no-unused-vars": "off", "@typescript-eslint/no-unused-vars": "off" },
  },
  prettier,
);
