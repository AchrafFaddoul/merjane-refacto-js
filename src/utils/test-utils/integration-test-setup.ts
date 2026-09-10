import {exec as execCallback} from 'node:child_process';
import {promisify} from 'node:util';
import {rm} from 'node:fs/promises';
import {beforeEach, afterEach} from 'vitest';
import {CONFIG} from '../../configuration/index.js';

const exec = promisify(execCallback);
const databaseConfig = CONFIG.get('db');

beforeEach(async () => {
	await exec(`pnpm drizzle-kit push --schema=src/db/schema.ts --dialect=sqlite --url=${databaseConfig.url}`);
});

afterEach(async () => {
	await rm(databaseConfig.url);
});
