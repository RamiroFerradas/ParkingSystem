import nextConfig from "eslint-config-next";

const eslintConfig = [
  {
    ignores: ["_legacy/**", "node_modules/**", ".next/**", "out/**"],
  },
  // eslint-config-next 16 ships a native flat config (array of config objects).
  ...nextConfig,
  {
    rules: {
      // Los diálogos nativos (alert/confirm/prompt) bloquean la UI y no se
      // pueden estilar: la app usa componentes propios de `ui/dialog`.
      "no-alert": "error",
    },
  },
];

export default eslintConfig;
