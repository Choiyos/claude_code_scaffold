import * as fs from 'fs-extra';
import * as path from 'path';
import { Pool } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger('database:migrate');

export interface MigrationFile {
  version: string;
  name: string;
  path: string;
  content: string;
}

export class DatabaseMigrator {
  private pool: Pool;
  private migrationsDir: string;

  constructor(pool: Pool, migrationsDir?: string) {
    this.pool = pool;
    this.migrationsDir = migrationsDir || path.join(__dirname, 'migrations');
  }

  async initialize(): Promise<void> {
    logger.info('Initializing database migrator');
    
    // Create migrations table if it doesn't exist
    await this.createMigrationsTable();
    
    logger.info('Database migrator initialized');
  }

  async migrate(): Promise<void> {
    logger.info('Starting database migration');
    
    try {
      // Get all migration files
      const migrationFiles = await this.getMigrationFiles();
      
      // Get already applied migrations
      const appliedMigrations = await this.getAppliedMigrations();
      
      // Filter out already applied migrations
      const pendingMigrations = migrationFiles.filter(
        migration => !appliedMigrations.includes(migration.version)
      );
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations found');
        return;
      }
      
      logger.info(`Found ${pendingMigrations.length} pending migrations`);
      
      // Apply migrations in order
      for (const migration of pendingMigrations) {
        await this.applyMigration(migration);
      }
      
      logger.info('Database migration completed successfully');
      
    } catch (error) {
      logger.error('Database migration failed:', error);
      throw error;
    }
  }

  async rollback(version?: string): Promise<void> {
    logger.info('Starting database rollback', { version });
    
    // This is a simplified rollback - in production, you'd want separate rollback scripts
    logger.warn('Rollback not implemented - migrations are designed to be forward-only');
    throw new Error('Rollback not implemented');
  }

  async getStatus(): Promise<any> {
    const migrationFiles = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    
    const status = migrationFiles.map(migration => ({
      version: migration.version,
      name: migration.name,
      applied: appliedMigrations.includes(migration.version),
      appliedAt: null // Would need to store timestamp in migrations table
    }));
    
    return {
      total: migrationFiles.length,
      applied: appliedMigrations.length,
      pending: migrationFiles.length - appliedMigrations.length,
      migrations: status
    };
  }

  private async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    await this.pool.query(query);
    logger.debug('Migrations table created or already exists');
  }

  private async getMigrationFiles(): Promise<MigrationFile[]> {
    if (!await fs.pathExists(this.migrationsDir)) {
      logger.warn(`Migrations directory not found: ${this.migrationsDir}`);
      return [];
    }
    
    const files = await fs.readdir(this.migrationsDir);
    const migrationFiles: MigrationFile[] = [];
    
    for (const file of files) {
      if (file.endsWith('.sql')) {
        const filePath = path.join(this.migrationsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        // Extract version from filename (e.g., "001_initial_schema.sql" -> "001")
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (match) {
          migrationFiles.push({
            version: match[1],
            name: match[2],
            path: filePath,
            content
          });
        }
      }
    }
    
    // Sort by version
    migrationFiles.sort((a, b) => a.version.localeCompare(b.version));
    
    return migrationFiles;
  }

  private async getAppliedMigrations(): Promise<string[]> {
    try {
      const result = await this.pool.query(
        'SELECT version FROM schema_migrations ORDER BY version'
      );
      
      return result.rows.map(row => row.version);
    } catch (error) {
      logger.warn('Failed to get applied migrations, assuming none applied');
      return [];
    }
  }

  private async applyMigration(migration: MigrationFile): Promise<void> {
    logger.info(`Applying migration ${migration.version}: ${migration.name}`);
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Execute migration SQL
      await client.query(migration.content);
      
      // Record migration as applied
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [migration.version]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Migration ${migration.version} applied successfully`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to apply migration ${migration.version}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const createMigrator = (pool: Pool, migrationsDir?: string): DatabaseMigrator => {
  return new DatabaseMigrator(pool, migrationsDir);
};