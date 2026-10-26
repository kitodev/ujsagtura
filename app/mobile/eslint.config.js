// ESLint (Expo ajánlott szabályai).
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/*", ".expo/*", "node_modules/*"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // A React Compiler szabályai: az alkalmazás nem használja a fordítót, és a „legfrissebb érték ref-ben”,
      // az időzítő (Date.now) és a betöltés előtti alaphelyzetbe állítás mintái szándékosak (mint a webes változatban).
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
]);
