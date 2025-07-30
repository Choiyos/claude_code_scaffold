import { Pool } from 'pg';
import { BaseRepository } from './BaseRepository';
import { User, Team, TeamMember } from '../types';
import { UserModel, TeamModel, TeamMemberModel } from '../models/User';
import { NotFoundError } from '../utils/errors';

export class UserRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const query = `
      INSERT INTO users (email, name, role, team_id, preferences)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      user.email,
      user.name,
      user.role,
      user.teamId,
      JSON.stringify(user.preferences)
    ];

    const result = await this.query(query, values);
    return UserModel.fromRow(result.rows[0]);
  }

  async findById(id: string): Promise<User> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.query(query, [id]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('User', id);
    }
    
    return UserModel.fromRow(result.rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await this.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return UserModel.fromRow(result.rows[0]);
  }

  async findAll(filters?: {
    teamId?: string;
    role?: string;
    limit?: number;
    offset?: number;
  }): Promise<User[]> {
    const conditions: Record<string, any> = {};
    
    if (filters?.teamId) {
      conditions.team_id = filters.teamId;
    }
    
    if (filters?.role) {
      conditions.role = filters.role;
    }

    const { clause, params } = this.buildWhereClause(conditions);
    
    let query = `SELECT * FROM users ${clause} ORDER BY created_at DESC`;
    
    if (filters?.limit) {
      query += ` ${this.buildLimitClause(filters.limit, filters.offset)}`;
    }

    const result = await this.query(query, params);
    return result.rows.map(UserModel.fromRow);
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }
    
    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    
    if (updates.role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(updates.role);
    }
    
    if (updates.teamId !== undefined) {
      fields.push(`team_id = $${paramIndex++}`);
      values.push(updates.teamId);
    }
    
    if (updates.preferences !== undefined) {
      fields.push(`preferences = $${paramIndex++}`);
      values.push(JSON.stringify(updates.preferences));
    }
    
    if (updates.lastLoginAt !== undefined) {
      fields.push(`last_login_at = $${paramIndex++}`);
      values.push(updates.lastLoginAt);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    const query = `
      UPDATE users 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    values.push(id);
    const result = await this.query(query, values);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('User', id);
    }
    
    return UserModel.fromRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await this.query(query, [id]);
    
    if (result.rowCount === 0) {
      throw new NotFoundError('User', id);
    }
  }

  async updateLastLogin(id: string): Promise<void> {
    const query = 'UPDATE users SET last_login_at = NOW() WHERE id = $1';
    await this.query(query, [id]);
  }
}

export class TeamRepository extends BaseRepository {
  constructor(pool: Pool) {
    super(pool);
  }

  async create(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt' | 'members'>): Promise<Team> {
    const query = `
      INSERT INTO teams (name, description, config)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const values = [
      team.name,
      team.description,
      JSON.stringify(team.config)
    ];

    const result = await this.query(query, values);
    const teamData = TeamModel.fromRow(result.rows[0]);
    
    return {
      ...teamData,
      members: []
    };
  }

  async findById(id: string, includeMembers: boolean = true): Promise<Team> {
    const query = 'SELECT * FROM teams WHERE id = $1';
    const result = await this.query(query, [id]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Team', id);
    }
    
    const teamData = TeamModel.fromRow(result.rows[0]);
    let members: TeamMember[] = [];
    
    if (includeMembers) {
      members = await this.getTeamMembers(id);
    }
    
    return {
      ...teamData,
      members
    };
  }

  async findAll(limit?: number, offset?: number): Promise<Team[]> {
    let query = 'SELECT * FROM teams ORDER BY created_at DESC';
    
    if (limit) {
      query += ` ${this.buildLimitClause(limit, offset)}`;
    }

    const result = await this.query(query);
    const teams = result.rows.map(TeamModel.fromRow);
    
    // Get members for each team
    const teamsWithMembers = await Promise.all(
      teams.map(async (team) => ({
        ...team,
        members: await this.getTeamMembers(team.id)
      }))
    );
    
    return teamsWithMembers;
  }

  async update(id: string, updates: Partial<Team>): Promise<Team> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    
    if (updates.config !== undefined) {
      fields.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(updates.config));
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    const query = `
      UPDATE teams 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    values.push(id);
    const result = await this.query(query, values);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Team', id);
    }
    
    const teamData = TeamModel.fromRow(result.rows[0]);
    const members = await this.getTeamMembers(id);
    
    return {
      ...teamData,
      members
    };
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM teams WHERE id = $1';
    const result = await this.query(query, [id]);
    
    if (result.rowCount === 0) {
      throw new NotFoundError('Team', id);
    }
  }

  async addMember(teamId: string, userId: string, role: string): Promise<void> {
    const query = `
      INSERT INTO team_members (team_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (team_id, user_id) DO UPDATE SET role = $3
    `;
    
    await this.query(query, [teamId, userId, role]);
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const query = 'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2';
    await this.query(query, [teamId, userId]);
  }

  async updateMemberRole(teamId: string, userId: string, role: string): Promise<void> {
    const query = 'UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3';
    const result = await this.query(query, [role, teamId, userId]);
    
    if (result.rowCount === 0) {
      throw new NotFoundError('TeamMember', `${teamId}-${userId}`);
    }
  }

  private async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const query = 'SELECT * FROM team_members WHERE team_id = $1 ORDER BY joined_at ASC';
    const result = await this.query(query, [teamId]);
    
    return result.rows.map(row => ({
      userId: row.user_id,
      role: row.role,
      joinedAt: new Date(row.joined_at)
    }));
  }
}