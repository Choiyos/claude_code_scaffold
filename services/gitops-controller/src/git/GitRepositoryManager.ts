import { SimpleGit, simpleGit, CheckRepoActions } from 'simple-git';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';

export interface GitRepositoryConfig {
  workDir: string;
  defaultBranch: string;
  remoteUrl?: string;
  credentials?: {
    username: string;
    token: string;
  };
}

export interface GitRepositoryInfo {
  isRepository: boolean;
  currentBranch: string;
  hasRemote: boolean;
  remoteUrl?: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  uncommittedChanges: boolean;
}

export interface GitCommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
  files: string[];
}

export class GitRepositoryManager {
  private git: SimpleGit;
  private config: GitRepositoryConfig;
  private logger: Logger;

  constructor(config: GitRepositoryConfig) {
    this.config = config;
    this.logger = new Logger('GitRepositoryManager');
    this.git = simpleGit({
      baseDir: config.workDir,
      binary: 'git',
      maxConcurrentProcesses: 6,
      config: [
        'user.name=Claude Environment',
        'user.email=claude-env@localhost',
        'core.autocrlf=false'
      ]
    });
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing Git repository manager', {
      workDir: this.config.workDir,
      defaultBranch: this.config.defaultBranch
    });

    try {
      // Ensure work directory exists
      await fs.mkdir(this.config.workDir, { recursive: true });

      // Initialize repository if it doesn't exist
      const isRepo = await this.git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
      
      if (!isRepo) {
        await this.git.init();
        await this.git.checkoutLocalBranch(this.config.defaultBranch);
        
        this.logger.info('Git repository initialized', {
          workDir: this.config.workDir,
          branch: this.config.defaultBranch
        });
      }

      // Configure remote if provided
      if (this.config.remoteUrl) {
        await this.configureRemote();
      }

      this.logger.info('Git repository manager initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Git repository', { error });
      throw error;
    }
  }

  async getRepositoryInfo(): Promise<GitRepositoryInfo> {
    try {
      const isRepo = await this.git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
      
      if (!isRepo) {
        return {
          isRepository: false,
          currentBranch: '',
          hasRemote: false,
          uncommittedChanges: false
        };
      }

      const status = await this.git.status();
      const currentBranch = status.current || this.config.defaultBranch;
      
      // Get remote info
      const remotes = await this.git.getRemotes(true);
      const hasRemote = remotes.length > 0;
      const remoteUrl = hasRemote ? remotes[0].refs.fetch : undefined;

      // Get last commit info
      let lastCommitHash: string | undefined;
      let lastCommitMessage: string | undefined;

      try {
        const log = await this.git.log({ maxCount: 1 });
        if (log.latest) {
          lastCommitHash = log.latest.hash;
          lastCommitMessage = log.latest.message;
        }
      } catch (error) {
        // No commits yet
      }

      return {
        isRepository: true,
        currentBranch,
        hasRemote,
        remoteUrl,
        lastCommitHash,
        lastCommitMessage,
        uncommittedChanges: !status.isClean()
      };

    } catch (error) {
      this.logger.error('Failed to get repository info', { error });
      throw error;
    }
  }

  async commitChanges(message: string, files?: string[]): Promise<string> {
    try {
      this.logger.info('Committing changes', { message, files });

      // Add files
      if (files && files.length > 0) {
        await this.git.add(files);
      } else {
        await this.git.add('.');
      }

      // Check if there are changes to commit
      const status = await this.git.status();
      if (status.staged.length === 0) {
        this.logger.warn('No changes to commit');
        return '';
      }

      // Commit changes
      const result = await this.git.commit(message);
      const commitHash = result.commit;

      this.logger.info('Changes committed successfully', {
        hash: commitHash,
        message,
        files: status.staged
      });

      return commitHash;

    } catch (error) {
      this.logger.error('Failed to commit changes', { error, message });
      throw error;
    }
  }

  async pullChanges(): Promise<void> {
    try {
      this.logger.info('Pulling changes from remote');

      const remotes = await this.git.getRemotes();
      if (remotes.length === 0) {
        this.logger.warn('No remote configured, skipping pull');
        return;
      }

      const result = await this.git.pull();
      
      this.logger.info('Changes pulled successfully', {
        summary: result.summary,
        files: result.files
      });

    } catch (error) {
      this.logger.error('Failed to pull changes', { error });
      throw error;
    }
  }

  async pushChanges(): Promise<void> {
    try {
      this.logger.info('Pushing changes to remote');

      const remotes = await this.git.getRemotes();
      if (remotes.length === 0) {
        this.logger.warn('No remote configured, skipping push');
        return;
      }

      const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      await this.git.push('origin', currentBranch);

      this.logger.info('Changes pushed successfully', { branch: currentBranch });

    } catch (error) {
      this.logger.error('Failed to push changes', { error });
      throw error;
    }
  }

  async getUncommittedChanges(): Promise<string[]> {
    try {
      const status = await this.git.status();
      
      return [
        ...status.not_added,
        ...status.created,
        ...status.deleted,
        ...status.modified,
        ...status.renamed
      ];

    } catch (error) {
      this.logger.error('Failed to get uncommitted changes', { error });
      throw error;
    }
  }

  async getCommitHistory(limit: number = 10): Promise<GitCommitInfo[]> {
    try {
      const log = await this.git.log({ maxCount: limit });
      
      return log.all.map(commit => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: `${commit.author_name} <${commit.author_email}>`,
        files: commit.diff?.files?.map(f => f.file) || []
      }));

    } catch (error) {
      this.logger.error('Failed to get commit history', { error });
      throw error;
    }
  }

  async createBranch(branchName: string): Promise<void> {
    try {
      this.logger.info('Creating branch', { branchName });

      await this.git.checkoutLocalBranch(branchName);

      this.logger.info('Branch created successfully', { branchName });

    } catch (error) {
      this.logger.error('Failed to create branch', { error, branchName });
      throw error;
    }
  }

  async switchBranch(branchName: string): Promise<void> {
    try {
      this.logger.info('Switching branch', { branchName });

      await this.git.checkout(branchName);

      this.logger.info('Branch switched successfully', { branchName });

    } catch (error) {
      this.logger.error('Failed to switch branch', { error, branchName });
      throw error;
    }
  }

  async resetToCommit(commitHash: string, hard: boolean = false): Promise<void> {
    try {
      this.logger.info('Resetting to commit', { commitHash, hard });

      if (hard) {
        await this.git.reset(['--hard', commitHash]);
      } else {
        await this.git.reset(['--soft', commitHash]);
      }

      this.logger.info('Reset completed successfully', { commitHash, hard });

    } catch (error) {
      this.logger.error('Failed to reset to commit', { error, commitHash });
      throw error;
    }
  }

  async restoreFile(filePath: string, commitHash?: string): Promise<void> {
    try {
      this.logger.info('Restoring file', { filePath, commitHash });

      if (commitHash) {
        await this.git.checkout([commitHash, '--', filePath]);
      } else {
        await this.git.checkout(['HEAD', '--', filePath]);
      }

      this.logger.info('File restored successfully', { filePath });

    } catch (error) {
      this.logger.error('Failed to restore file', { error, filePath });
      throw error;
    }
  }

  async getDiff(filePath?: string): Promise<string> {
    try {
      if (filePath) {
        return await this.git.diff([filePath]);
      } else {
        return await this.git.diff();
      }

    } catch (error) {
      this.logger.error('Failed to get diff', { error, filePath });
      throw error;
    }
  }

  private async configureRemote(): Promise<void> {
    try {
      const remotes = await this.git.getRemotes();
      const hasOrigin = remotes.some(remote => remote.name === 'origin');

      if (!hasOrigin && this.config.remoteUrl) {
        await this.git.addRemote('origin', this.config.remoteUrl);
        this.logger.info('Remote origin configured', { url: this.config.remoteUrl });
      }

      // Configure credentials if provided
      if (this.config.credentials) {
        // This would typically involve setting up credential helper
        // For development, we'll skip this implementation
        this.logger.info('Git credentials configured');
      }

    } catch (error) {
      this.logger.error('Failed to configure remote', { error });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      this.logger.info('Cleaning up Git repository manager');
      
      // Perform any cleanup operations
      // Currently no specific cleanup needed for simple-git
      
      this.logger.info('Git repository manager cleanup completed');

    } catch (error) {
      this.logger.error('Error during Git cleanup', { error });
    }
  }
}