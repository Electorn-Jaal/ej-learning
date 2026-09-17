if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error('Use corepack pnpm install for this workspace.');
  process.exit(1);
}
