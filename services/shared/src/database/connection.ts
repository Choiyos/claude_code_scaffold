import { Pool, PoolConfig } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger('database');

let pool: Pool | null = null;

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export const createDatabasePool = (config: DatabaseConfig): Pool => {
  if (pool) {
    logger.warn('Database pool already exists, returning existing instance');
    return pool;
  }

  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: config.maxConnections || 20,
    idleTimeoutMillis: config.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
  };

  pool = new Pool(poolConfig);

  // Handle pool events
  pool.on('connect', (client) => {
    logger.debug('New database client connected');
  });

  pool.on('acquire', (client) => {
    logger.debug('Database client acquired from pool');
  });

  pool.on('remove', (client) => {
    logger.debug('Database client removed from pool');
  });

  pool.on('error', (err, client) => {
    logger.error('Database pool error:', err);
  });

  logger.info('Database pool created successfully', {
    host: config.host,
    port: config.port,
    database: config.database,
    maxConnections: poolConfig.max
  });

  return pool;
};

export const getDatabasePool = (): Pool => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call createDatabasePool first.');
  }
  return pool;
};

export const closeDatabasePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
};

export const testDatabaseConnection = async (config: DatabaseConfig): Promise<boolean> => {
  const testPool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await testPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    await testPool.end();
    
    logger.info('Database connection test successful');
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', error);
    await testPool.end().catch(() => {});
    return false;
  }
};

export const getConnectionInfo = (): any => {
  if (!pool) {
    return null;
  }

  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };
};