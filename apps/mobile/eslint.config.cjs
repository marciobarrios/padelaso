const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expo,
  {
    files: ["*.cjs"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
  },
  { ignores: ["dist/**", ".expo/**", "ios/**", "android/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "next",
            "next/*",
            "react-dom",
            "react-dom/*",
            "@padelaso/app",
            "@padelaso/app/*",
            "**/apps/app/**",
            "**/apps/marketing/**",
          ],
        },
      ],
    },
  },
]);
