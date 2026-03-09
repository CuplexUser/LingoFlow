const js = require("@eslint/js");
const { fixupPluginRules } = require("@eslint/compat");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const reactPlugin = require("eslint-plugin-react");
const reactHooksPlugin = require("eslint-plugin-react-hooks");

const tsRecommended = tsPlugin.configs["flat/recommended"];
const compatReactPlugin = fixupPluginRules(reactPlugin);
const compatReactHooksPlugin = fixupPluginRules(reactHooksPlugin);

module.exports = [
  {
    ignores: ["node_modules/**", "client/dist/**", "server/data/**"]
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly"
      }
    }
  },
  js.configs.recommended,
  ...tsRecommended.map((config) => ({
    ...config,
    files: ["client/src/**/*.{js,jsx,ts,tsx}", "server/src/**/*.ts"]
  })),
  {
    files: ["client/src/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        window: "readonly"
      }
    },
    plugins: {
      react: compatReactPlugin,
      "react-hooks": compatReactHooksPlugin
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactHooksPlugin.configs["recommended-latest"].rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off"
    }
  },
  {
    files: ["client/src/__tests__/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        expect: "readonly",
        test: "readonly",
        vi: "readonly"
      }
    }
  },
  {
    files: ["client/vite.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly"
      }
    }
  },
  {
    files: ["server/src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  }
];
