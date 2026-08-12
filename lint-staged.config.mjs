const lintStagedConfig = {
  "*.{js,jsx,ts,tsx,mjs,cjs}": [
    "eslint --fix --max-warnings=0 --no-warn-ignored",
    "prettier --write",
  ],
  "*.{css,json,md,mdx,yaml,yml}": "prettier --write",
};

export default lintStagedConfig;
