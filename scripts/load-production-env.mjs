// Preload before CLI integration tests on the deployed release. Configuration
// stays in the existing server-only Next dotenv file, never in command arguments.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
