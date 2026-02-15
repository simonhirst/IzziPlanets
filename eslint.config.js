import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "main.js"
    ],
  },
  js.configs.recommended,
  {
    files: ["src/main.ts"],
    rules: {
      "no-undef": "off",
      "no-redeclare": "off",
      "no-empty": "off",
      "no-unused-vars": "off"
    }
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "playwright.config.ts", "vite.config.ts"],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      ecmaVersion: 2022,
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        location: "readonly",
        localStorage: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        Worker: "readonly",
        URL: "readonly",
        fetch: "readonly",
        Blob: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly"
      }
    },
    rules: {
      "no-undef": "off",
      "no-redeclare": "off",
      "no-empty": "off",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["public/sw.js", "scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        console: "readonly",
        process: "readonly",
        URLSearchParams: "readonly"
      }
    },
    rules: {
      "no-undef": "off"
    }
  }
];
