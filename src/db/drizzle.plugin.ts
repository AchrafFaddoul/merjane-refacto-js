import {type FastifyPluginAsync} from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import SqliteDatabase from 'better-sqlite3';
import {drizzle} from 'drizzle-orm/better-sqlite3';
import {CONFIG} from '../configuration/index.js';
import * as schema from './schema.js';
import {type Database} from './type.js';

declare module 'fastify' {
	interface FastifyInstance { // eslint-disable-line @typescript-eslint/consistent-type-definitions
		database: Database;
	}
}

const databaseConfig = CONFIG.get('db');
const appConfig = CONFIG.get('app');
export const drizzlePlugin: FastifyPluginAsync = fastifyPlugin(
	async server => {
		const sqlite = new SqliteDatabase(databaseConfig.url);
		const database = drizzle(sqlite, {
			schema,
			...(appConfig.env === 'PROD' ? {} : {logger: true}),
		});

		server.decorate('database', database);

		server.addHook('onClose', async () => {
			server.log.info('Closing database connection pool');
			sqlite.close();
			server.log.info('Closed database connection pool');
		});
	},
);
