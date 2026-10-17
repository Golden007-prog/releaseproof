// Runs before every test file. Tests must never see the developer's real npm credentials:
// point npm's user config at a file that does not exist and drop token variables.
process.env.NPM_CONFIG_USERCONFIG = "/nonexistent/releaseproof-tests/.npmrc";
delete process.env.NPM_TOKEN;
delete process.env.NODE_AUTH_TOKEN;
