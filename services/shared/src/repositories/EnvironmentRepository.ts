import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';
import { Environment } from '../types';
import { EnvironmentModel } from '../models/Environment';
import { NotFoundError } from '../utils/errors';

export interface EnvironmentFilters {
  userId?: string;
  teamId?: string;
  status?: string;
  type?: string;
}

export interface EnvironmentListOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
}

export class EnvironmentRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async create(environment: Omit<Environment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Environment> {
    const query = `
      INSERT INTO environments (name, description, status, type, config, metadata, user_id, team_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const params = [
      environment.name,
      environment.description,
      environment.status,
      environment.type,
      JSON.stringify(environment.config),
      JSON.stringify(environment.metadata),
      environment.userId,
      environment.teamId
    ];

    const result = await this.query(query, params);
    return EnvironmentModel.fromRow(result.rows[0]);
  }

  async findById(id: string): Promise<Environment> {
    const query = 'SELECT * FROM environments WHERE id = $1';
    const result = await this.query(query, [id]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Environment', id);
    }

    return EnvironmentModel.fromRow(result.rows[0]);
  }

  async findByName(name: string, userId: string): Promise<Environment | null> {
    const query = 'SELECT * FROM environments WHERE name = $1 AND user_id = $2';
    const result = await this.query(query, [name, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return EnvironmentModel.fromRow(result.rows[0]);
  }

  async list(filters: EnvironmentFilters = {}, options: EnvironmentListOptions = {}): Promise<{
    environments: Environment[];
    total: number;
  }> {
    const { clause: whereClause, params } = this.buildWhereClause({
      user_id: filters.userId,
      team_id: filters.teamId,
      status: filters.status,
      type: filters.type
    });

    const orderClause = this.buildOrderClause(options.orderBy || 'created_at', options.order || 'DESC');
    const limitClause = this.buildLimitClause(options.limit, options.offset);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM environments ${whereClause}`;
    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get environments
    const query = `
      SELECT * FROM environments 
      ${whereClause} 
      ${orderClause} 
      ${limitClause}
    `;
    const result = await this.query(query, params);

    const environments = result.rows.map(EnvironmentModel.fromRow);

    return { environments, total };
  }

  async update(id: string, updates: Partial<Environment>): Promise<Environment> {
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }

    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }

    if (updates.status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`);
      params.push(updates.status);
    }

    if (updates.type !== undefined) {
      updateFields.push(`type = $${paramIndex++}`);
      params.push(updates.type);
    }

    if (updates.config !== undefined) {
      updateFields.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(updates.config));
    }

    if (updates.metadata !== undefined) {
      updateFields.push(`metadata = $${paramIndex++}`);
      params.push(JSON.stringify(updates.metadata));
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    const query = `
      UPDATE environments 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    params.push(id);

    const result = await this.query(query, params);

    if (result.rows.length === 0) {
      throw new NotFoundError('Environment', id);
    }

    return EnvironmentModel.fromRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM environments WHERE id = $1';
    const result = await this.query(query, [id]);

    if (result.rowCount === 0) {
      throw new NotFoundError('Environment', id);
    }
  }

  async findByUser(userId: string): Promise<Environment[]> {
    const query = 'SELECT * FROM environments WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await this.query(query, [userId]);

    return result.rows.map(EnvironmentModel.fromRow);
  }

  async findByTeam(teamId: string): Promise<Environment[]> {
    const query = 'SELECT * FROM environments WHERE team_id = $1 ORDER BY created_at DESC';
    const result = await this.query(query, [teamId]);

    return result.rows.map(EnvironmentModel.fromRow);
  }

  async findByStatus(status: string): Promise<Environment[]> {
    const query = 'SELECT * FROM environments WHERE status = $1 ORDER BY created_at DESC';
    const result = await this.query(query, [status]);

    return result.rows.map(EnvironmentModel.fromRow);
  }

  async updateStatus(id: string, status: string): Promise<Environment> {
    const query = `
      UPDATE environments 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    const result = await this.query(query, [status, id]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Environment', id);
    }

    return EnvironmentModel.fromRow(result.rows[0]);
  }

  async getEnvironmentStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const queries = [
      'SELECT COUNT(*) as total FROM environments',
      'SELECT status, COUNT(*) as count FROM environments GROUP BY status',
      'SELECT type, COUNT(*) as count FROM environments GROUP BY type'
    ];

    const [totalResult, statusResult, typeResult] = await Promise.all(
      queries.map(query => this.query(query))
    );

    const byStatus: Record<string, number> = {};
    statusResult.rows.forEach((row: any) => {
      byStatus[row.status] = parseInt(row.count);
    });

    const byType: Record<string, number> = {};
    typeResult.rows.forEach((row: any) => {
      byType[row.type] = parseInt(row.count);
    });

    return {
      total: parseInt(totalResult.rows[0].total),
      byStatus,
      byType
    };
  }
}