// Claude Code MongoDB Initialization Script

// Switch to claude_code database
db = db.getSiblingDB('claude_code');

// Create users
db.createUser({
  user: 'claude_app',
  pwd: 'app_password',
  roles: [
    { role: 'readWrite', db: 'claude_code' },
    { role: 'readWrite', db: 'claude_code_test' },
    { role: 'readWrite', db: 'claude_code_analytics' }
  ]
});

db.createUser({
  user: 'claude_readonly',
  pwd: 'readonly_password',
  roles: [
    { role: 'read', db: 'claude_code' },
    { role: 'read', db: 'claude_code_test' },
    { role: 'read', db: 'claude_code_analytics' }
  ]
});

// Create collections with validation
db.createCollection('projects', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'createdAt'],
      properties: {
        name: {
          bsonType: 'string',
          description: 'Project name is required and must be a string'
        },
        description: {
          bsonType: 'string',
          description: 'Project description must be a string'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Created timestamp is required'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Updated timestamp must be a date'
        },
        metadata: {
          bsonType: 'object',
          description: 'Metadata must be an object'
        },
        tags: {
          bsonType: 'array',
          items: {
            bsonType: 'string'
          },
          description: 'Tags must be an array of strings'
        }
      }
    }
  }
});

db.createCollection('sessions', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['projectId', 'userId', 'startedAt'],
      properties: {
        projectId: {
          bsonType: 'objectId',
          description: 'Project ID is required and must be an ObjectId'
        },
        userId: {
          bsonType: 'string',
          description: 'User ID is required and must be a string'
        },
        startedAt: {
          bsonType: 'date',
          description: 'Started timestamp is required'
        },
        endedAt: {
          bsonType: 'date',
          description: 'Ended timestamp must be a date'
        },
        status: {
          bsonType: 'string',
          enum: ['active', 'completed', 'cancelled'],
          description: 'Status must be one of: active, completed, cancelled'
        },
        metadata: {
          bsonType: 'object',
          description: 'Metadata must be an object'
        }
      }
    }
  }
});

db.createCollection('conversations', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sessionId', 'messages', 'createdAt'],
      properties: {
        sessionId: {
          bsonType: 'objectId',
          description: 'Session ID is required and must be an ObjectId'
        },
        messages: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['role', 'content', 'timestamp'],
            properties: {
              role: {
                bsonType: 'string',
                enum: ['user', 'assistant', 'system'],
                description: 'Role must be one of: user, assistant, system'
              },
              content: {
                bsonType: 'string',
                description: 'Content is required and must be a string'
              },
              timestamp: {
                bsonType: 'date',
                description: 'Timestamp is required'
              },
              metadata: {
                bsonType: 'object',
                description: 'Metadata must be an object'
              }
            }
          },
          description: 'Messages must be an array of message objects'
        },
        createdAt: {
          bsonType: 'date',
          description: 'Created timestamp is required'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Updated timestamp must be a date'
        }
      }
    }
  }
});

db.createCollection('analytics_events', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sessionId', 'eventType', 'eventData', 'timestamp'],
      properties: {
        sessionId: {
          bsonType: 'objectId',
          description: 'Session ID is required and must be an ObjectId'
        },
        eventType: {
          bsonType: 'string',
          description: 'Event type is required and must be a string'
        },
        eventData: {
          bsonType: 'object',
          description: 'Event data is required and must be an object'
        },
        timestamp: {
          bsonType: 'date',
          description: 'Timestamp is required'
        },
        userAgent: {
          bsonType: 'string',
          description: 'User agent must be a string'
        },
        ipAddress: {
          bsonType: 'string',
          description: 'IP address must be a string'
        }
      }
    }
  }
});

// Create indexes
db.projects.createIndex({ name: 'text', description: 'text' });
db.projects.createIndex({ 'tags': 1 });
db.projects.createIndex({ 'createdAt': -1 });

db.sessions.createIndex({ projectId: 1 });
db.sessions.createIndex({ userId: 1 });
db.sessions.createIndex({ startedAt: -1 });
db.sessions.createIndex({ status: 1 });

db.conversations.createIndex({ sessionId: 1 });
db.conversations.createIndex({ 'messages.timestamp': -1 });
db.conversations.createIndex({ createdAt: -1 });

db.analytics_events.createIndex({ sessionId: 1 });
db.analytics_events.createIndex({ eventType: 1, timestamp: -1 });
db.analytics_events.createIndex({ timestamp: -1 });

// Insert sample data
const sampleProjects = [
  {
    name: 'claude-code-core',
    description: 'Core Claude Code functionality',
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: { version: '1.0.0', language: 'typescript' },
    tags: ['core', 'typescript', 'api']
  },
  {
    name: 'superlaude-framework',
    description: 'SuperClaude framework implementation',
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: { version: '1.0.0', language: 'typescript' },
    tags: ['framework', 'typescript', 'ai']
  },
  {
    name: 'mcp-integration',
    description: 'MCP server integration',
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: { version: '1.0.0', language: 'typescript' },
    tags: ['integration', 'mcp', 'typescript']
  }
];

db.projects.insertMany(sampleProjects);

print('Claude Code MongoDB initialization completed successfully!');

// Switch to analytics database and set up time series collections (MongoDB 5.0+)
db = db.getSiblingDB('claude_code_analytics');

try {
  db.createCollection('metrics', {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'metadata',
      granularity: 'minutes'
    }
  });
  
  db.createCollection('performance_metrics', {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'service',
      granularity: 'seconds'
    }
  });
  
  print('Time series collections created successfully!');
} catch (e) {
  print('Time series collections not supported in this MongoDB version:', e.message);
}

print('Claude Code MongoDB setup completed!');