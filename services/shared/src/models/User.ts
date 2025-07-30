import { User, UserRole, UserPreferences, Team, TeamRole, TeamConfig } from '../types';

export class UserModel {
  static tableName = 'users';

  static createTableSQL = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'developer',
      team_id UUID REFERENCES teams(id),
      preferences JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      last_login_at TIMESTAMP WITH TIME ZONE,
      
      CONSTRAINT users_role_check CHECK (
        role IN ('admin', 'team_lead', 'developer', 'viewer')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

    -- Trigger to update updated_at timestamp
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
  `;

  static fromRow(row: any): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role as UserRole,
      teamId: row.team_id,
      preferences: row.preferences as UserPreferences,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined
    };
  }

  static toRow(user: Partial<User>): any {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team_id: user.teamId,
      preferences: JSON.stringify(user.preferences),
      last_login_at: user.lastLoginAt
    };
  }
}

export class TeamModel {
  static tableName = 'teams';

  static createTableSQL = `
    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) UNIQUE NOT NULL,
      description TEXT,
      config JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
    CREATE INDEX IF NOT EXISTS idx_teams_created_at ON teams(created_at);

    -- Trigger to update updated_at timestamp
    DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
    CREATE TRIGGER update_teams_updated_at
        BEFORE UPDATE ON teams
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
  `;

  static fromRow(row: any): Omit<Team, 'members'> {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      config: row.config as TeamConfig,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      members: [] // Will be populated separately
    };
  }

  static toRow(team: Partial<Team>): any {
    return {
      id: team.id,
      name: team.name,
      description: team.description,
      config: JSON.stringify(team.config)
    };
  }
}

export class TeamMemberModel {
  static tableName = 'team_members';

  static createTableSQL = `
    CREATE TABLE IF NOT EXISTS team_members (
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      
      PRIMARY KEY (team_id, user_id),
      CONSTRAINT team_members_role_check CHECK (
        role IN ('owner', 'admin', 'member')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
  `;

  static fromRow(row: any) {
    return {
      teamId: row.team_id,
      userId: row.user_id,
      role: row.role as TeamRole,
      joinedAt: new Date(row.joined_at)
    };
  }

  static toRow(member: any): any {
    return {
      team_id: member.teamId,
      user_id: member.userId,
      role: member.role,
      joined_at: member.joinedAt
    };
  }
}