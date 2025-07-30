import { Pool, PoolClient } from 'pg';
import { createLogger } from '../utils/logger';
import { AppError } from '../utils/errors';

const logger = createLogger('database');

export abstract class BaseRepository {
  protected pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  protected async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  protected async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Query executed', {
        query: text,
        params,
        duration,
        rowCount: result.rowCount
      });
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - start;
      
      logger.error('Query failed', {
        query: text,
        params,
        duration,
        error: error.message
      });
      
      // Convert database errors to application errors
      if (error.code === '23505') { // Unique violation
        throw new AppError('Resource already exists', 409, 'DUPLICATE_RESOURCE');
      } else if (error.code === '23503') { // Foreign key violation
        throw new AppError('Referenced resource not found', 400, 'INVALID_REFERENCE');
      } else if (error.code === '23514') { // Check constraint violation
        throw new AppError('Data validation failed', 400, 'VALIDATION_ERROR');
      }
      
      throw error;
    }
  }

  protected buildWhereClause(conditions: Record<string, any>): { clause: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(conditions)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
          clauses.push(`${key} IN (${placeholders})`);
          params.push(...value);
        } else {
          clauses.push(`${key} = $${paramIndex++}`);
          params.push(value);
        }
      }
    }

    return {
      clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params
    };
  }

  protected buildOrderClause(orderBy?: string, order: 'ASC' | 'DESC' = 'ASC'): string {
    if (!orderBy) return '';
    return `ORDER BY ${orderBy} ${order}`;
  }

  protected buildLimitClause(limit?: number, offset?: number): string {
    const clauses: string[] = [];
    
    if (limit) {
      clauses.push(`LIMIT ${limit}`);
    }
    
    if (offset) {
      clauses.push(`OFFSET ${offset}`);
    }
    
    return clauses.join(' ');
  }

  async healthCheck(): Promise<{ status: string; connections: any }> {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      const poolInfo = {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount
      };
      
      return {
        status: 'healthy',
        connections: poolInfo
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'unhealthy',
        connections: null
      };
    }
  }
}