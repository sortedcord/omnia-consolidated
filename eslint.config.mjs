import eslintConfigPrettier from "eslint-config-prettier";
import js from "eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },

  js.configs.recommend,

  ...tseslint.configs.recommended,

  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },

  eslintConfigPrettier,
];
