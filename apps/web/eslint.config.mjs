import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The 16.4 security update adds React Compiler diagnostics to the preset.
  // Keep existing UI debt visible without bundling a broad UI rewrite into a
  // security release. These rules remain errors outside this legacy file list.
  {
    files: [
      "src/app/v2/assistant/page.tsx",
      "src/app/v2/finance/page.tsx",
      "src/app/v2/homelab/HomelabConsoleClient.tsx",
      "src/app/v2/operations/OperationsClient.tsx",
      "src/app/v2/page.tsx",
      "src/app/v2/real-estate/page.tsx",
      "src/app/v2/todos/page.tsx",
      "src/components/MobileSyncStatus.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
