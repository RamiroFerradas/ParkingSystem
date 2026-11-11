import nextConfig from "eslint-config-next";

const eslintConfig = [
  {
    ignores: ["_legacy/**", "node_modules/**", ".next/**", "out/**"],
  },
  // eslint-config-next 16 ships a native flat config (array of config objects).
  ...nextConfig,
];

export default eslintConfig;
