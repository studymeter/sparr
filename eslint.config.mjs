import nextPlugin from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...nextPlugin,
  // Rules for all files
  {
    rules: {
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      complexity: ["warn", 10],
      "max-depth": ["warn", 3],
      "max-params": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      "id-length": [
        "warn",
        { min: 2, exceptions: ["i", "j", "x", "y", "t", "_"] },
      ],
    },
  },
  // TypeScript-specific rules (scoped to TS/TSX files only)
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        { selector: "function", format: ["camelCase", "PascalCase"] },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase"] },
        {
          selector: ["objectLiteralProperty", "typeProperty"],
          format: null,
        },
        { selector: "import", format: ["camelCase", "PascalCase"] },
      ],
    },
  }
);
