# Cloudflare Infrastructure Guide

*Everything you need to build and deploy full-stack applications on Cloudflare.*

---

## Why Cloudflare?

| Benefit | Details |
|---------|---------|
| **Free Tier** | 100k Worker requests/day, 5M D1 rows read/day, 10GB R2 storage |
| **Global Edge** | Code runs in 300+ cities, milliseconds from users |
| **Integrated Stack** | Workers + D1 + R2 + Queues + Pages work seamlessly together |
| **No Cold Starts** | Workers are always warm, instant response |
| **Simple Deployment** | Single command deploys with `wrangler` |

**The Stack:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE STACK                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Workers   │  │     D1      │  │     R2      │  │   Queues    │         │
│  │  (Compute)  │  │ (Database)  │  │  (Storage)  │  │   (Async)   │         │
│  │             │  │             │  │             │  │             │         │
│  │ • API       │  │ • SQL       │  │ • Files     │  │ • Jobs      │         │
│  │ • Logic     │  │ • Metadata  │  │ • Blobs     │  │ • Retries   │         │
│  │ • Routing   │  │ • Settings  │  │ • Assets    │  │ • Parallel  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                          │
│  │    Pages    │  │     KV      │  │    Cron     │                          │
│  │ (Frontend)  │  │  (Cache)    │  │ (Scheduled) │                          │
│  │             │  │             │  │             │                          │
│  │ • React     │  │ • Sessions  │  │ • Daily     │                          │
│  │ • Static    │  │ • Config    │  │ • Hourly    │                          │
│  │ • CDN       │  │ • Fast R/W  │  │ • Custom    │                          │
│  └─────────────┘  └─────────────┘  └─────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Minimal Working Example

```bash
# 1. Install wrangler
npm install -g wrangler

# 2. Login to Cloudflare
npx wrangler login

# 3. Create a new Worker project
npx wrangler init my-api
cd my-api

# 4. Deploy
npx wrangler deploy
```

Your API is now live at `https://my-api.<your-subdomain>.workers.dev`

### Full Stack in 5 Minutes

```bash
# Create resources
npx wrangler d1 create my-db
npx wrangler r2 bucket create my-files
npx wrangler queues create my-jobs

# Note the database_id from output, update wrangler.toml

# Apply schema
npx wrangler d1 execute my-db --remote --file=./schema.sql

# Deploy Worker
npx wrangler deploy

# Build and deploy frontend
cd portal && npm run build
npx wrangler pages deploy dist --project-name=my-portal
```

---

## Project Structure

### Standard Layout

```
project/
├── api/                        # Worker API
│   ├── src/
│   │   ├── index.ts            # Entry point + routes
│   │   ├── types.ts            # TypeScript interfaces
│   │   ├── handlers/           # Route handlers by domain
│   │   │   ├── markets.ts
│   │   │   ├── research.ts
│   │   │   └── settings.ts
│   │   ├── services/           # Business logic
│   │   │   ├── database.ts
│   │   │   └── storage.ts
│   │   └── lib/                # Utilities
│   │       ├── cors.ts
│   │       └── errors.ts
│   ├── schema.sql              # D1 database schema
│   ├── migrations/             # Schema migrations
│   │   └── 001_initial.sql
│   ├── wrangler.toml           # Cloudflare configuration
│   ├── package.json
│   └── tsconfig.json
├── portal/                     # Pages frontend
│   ├── src/
│   │   ├── App.tsx             # Main component
│   │   ├── main.tsx            # Entry point
│   │   ├── components/         # UI components
│   │   ├── hooks/              # Custom hooks
│   │   └── lib/                # Utilities
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── shared/                     # Shared types (optional)
│   └── types.ts
└── deploy.sh                   # Deployment script
```

### Configuration Files

**`api/wrangler.toml`** (complete example):

```toml
name = "my-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# R2 Bucket
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-files"

# Queue Producer
[[queues.producers]]
queue = "my-jobs"
binding = "JOBS_QUEUE"

# Queue Consumer
[[queues.consumers]]
queue = "my-jobs"
max_batch_size = 10
max_retries = 3
max_concurrency = 5

# KV Namespace (optional)
[[kv_namespaces]]
binding = "CACHE"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Cron Triggers (optional)
[triggers]
crons = [
  "0 6 * * *",    # Daily at 6 AM UTC
  "0 */4 * * *",  # Every 4 hours
]

# Environment Variables
[vars]
ENVIRONMENT = "production"
```

**`portal/vite.config.ts`**:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
```

---

## Workers (Compute)

### Hono Framework Setup

Hono is the recommended framework for Cloudflare Workers:

```typescript
// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Type-safe bindings
interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JOBS_QUEUE: Queue;
  CACHE: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('/*', cors({
  origin: ['https://my-portal.pages.dev', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
app.get('/items', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM items').all();
  return c.json(result.results);
});

app.post('/items', async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    'INSERT INTO items (id, name, created_at) VALUES (?, ?, datetime("now"))'
  ).bind(id, body.name).run();

  return c.json({ id }, 201);
});

// Queue consumer (same file or separate)
export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<unknown>, env: Env) {
    for (const message of batch.messages) {
      try {
        await processJob(message.body, env);
        message.ack();
      } catch (error) {
        message.retry();
      }
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(event, env));
  },
};
```

### CORS Handling

**CRITICAL**: Browsers cannot call third-party APIs directly due to CORS. Your Worker must proxy these requests:

```typescript
// BAD: Frontend calls external API directly (CORS error)
// fetch('https://api.external.com/data')

// GOOD: Frontend calls your Worker, Worker proxies to external API
app.post('/proxy/external', async (c) => {
  const body = await c.req.json();

  const response = await fetch('https://api.external.com/data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getApiKey(c.env.DB, 'external_api_key')}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return c.json(data);
});
```

### Error Handling Pattern

```typescript
import { HTTPException } from 'hono/http-exception';

// Custom error class
class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
  }
}

// Error handling middleware
app.onError((err, c) => {
  console.error('Error:', err);

  if (err instanceof AppError) {
    return c.json({
      error: err.message,
      code: err.code,
    }, err.statusCode);
  }

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  return c.json({ error: 'Internal server error' }, 500);
});

// Usage
app.get('/items/:id', async (c) => {
  const id = c.req.param('id');
  const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();

  if (!item) {
    throw new AppError(404, 'Item not found', 'ITEM_NOT_FOUND');
  }

  return c.json(item);
});
```

### Request Validation

```typescript
import { z } from 'zod';

const CreateItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

app.post('/items', async (c) => {
  const body = await c.req.json();

  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Invalid request body', 'VALIDATION_ERROR');
  }

  // Use parsed.data which is fully typed
  const { name, description, tags } = parsed.data;
  // ...
});
```

---

## D1 (Database)

### Schema Design Principles

```sql
-- schema.sql

-- Always use TEXT for IDs (UUIDs)
-- Always include created_at and updated_at
-- Use CHECK constraints for enums
-- Store JSON in TEXT columns

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  metadata TEXT,                        -- JSON object
  tags TEXT,                            -- JSON array
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Settings table (key-value for configuration)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Always create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at);
```

### Migration Strategy

Keep migrations in numbered files:

```
migrations/
├── 001_initial.sql
├── 002_add_users.sql
└── 003_add_indexes.sql
```

Apply migrations:

```bash
# Apply initial schema
npx wrangler d1 execute my-db --remote --file=./schema.sql

# Apply a migration
npx wrangler d1 execute my-db --remote --file=./migrations/003_add_indexes.sql

# Or run raw SQL
npx wrangler d1 execute my-db --remote --command="ALTER TABLE items ADD COLUMN priority INTEGER DEFAULT 0"
```

### Query Patterns

```typescript
// Get single item
const item = await env.DB.prepare(
  'SELECT * FROM items WHERE id = ?'
).bind(id).first<Item>();

// Get multiple items
const result = await env.DB.prepare(
  'SELECT * FROM items WHERE status = ? ORDER BY created_at DESC LIMIT ?'
).bind('active', 100).all<Item>();
const items = result.results;

// Insert
const id = crypto.randomUUID();
await env.DB.prepare(
  'INSERT INTO items (id, name, metadata) VALUES (?, ?, ?)'
).bind(id, name, JSON.stringify(metadata)).run();

// Update
await env.DB.prepare(
  'UPDATE items SET name = ?, updated_at = datetime("now") WHERE id = ?'
).bind(newName, id).run();

// Delete
await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();

// Batch operations
const batch = [
  env.DB.prepare('INSERT INTO items (id, name) VALUES (?, ?)').bind(id1, name1),
  env.DB.prepare('INSERT INTO items (id, name) VALUES (?, ?)').bind(id2, name2),
];
await env.DB.batch(batch);
```

### Settings Pattern

Store configuration in D1, not environment variables:

```typescript
// Get setting
async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const result = await db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).bind(key).first<{ value: string }>();
  return result?.value || null;
}

// Set setting
async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).bind(key, value, value).run();
}

// Usage
const apiKey = await getSetting(env.DB, 'claude_api_key');
await setSetting(env.DB, 'max_items', '100');
```

### JSON Columns

```typescript
// Storing JSON
const metadata = { category: 'tech', priority: 1 };
await env.DB.prepare(
  'INSERT INTO items (id, metadata) VALUES (?, ?)'
).bind(id, JSON.stringify(metadata)).run();

// Reading JSON
const item = await env.DB.prepare(
  'SELECT * FROM items WHERE id = ?'
).bind(id).first<{ id: string; metadata: string }>();

const metadata = JSON.parse(item.metadata || '{}');
```

---

## R2 (Object Storage)

### Upload Patterns

```typescript
// Simple upload
app.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    throw new AppError(400, 'No file provided');
  }

  const key = `uploads/${crypto.randomUUID()}-${file.name}`;

  await c.env.BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });

  return c.json({ key, size: file.size });
});

// Upload from URL
app.post('/upload-from-url', async (c) => {
  const { url, key } = await c.req.json();

  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError(400, 'Failed to fetch URL');
  }

  await c.env.BUCKET.put(key, response.body, {
    httpMetadata: {
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    },
  });

  return c.json({ key });
});
```

### Download/Streaming

```typescript
// Stream file
app.get('/files/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.BUCKET.get(key);

  if (!object) {
    throw new AppError(404, 'File not found');
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Length', object.size.toString());
  headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
});

// Download with filename
app.get('/download/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.BUCKET.get(key);

  if (!object) {
    throw new AppError(404, 'File not found');
  }

  const filename = object.customMetadata?.originalName || key.split('/').pop();

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  return new Response(object.body, { headers });
});
```

### Folder Organization

```typescript
// List files in a "folder"
app.get('/files', async (c) => {
  const prefix = c.req.query('prefix') || '';
  const delimiter = c.req.query('delimiter') || '/';

  const listed = await c.env.BUCKET.list({
    prefix,
    delimiter,
    limit: 100,
  });

  return c.json({
    files: listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
    })),
    folders: listed.delimitedPrefixes,
    truncated: listed.truncated,
    cursor: listed.cursor,
  });
});

// Delete folder (all files with prefix)
app.delete('/folders/:prefix{.+}', async (c) => {
  const prefix = c.req.param('prefix');

  let cursor: string | undefined;
  let deletedCount = 0;

  do {
    const listed = await c.env.BUCKET.list({ prefix, cursor, limit: 100 });

    for (const obj of listed.objects) {
      await c.env.BUCKET.delete(obj.key);
      deletedCount++;
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return c.json({ deleted: deletedCount });
});
```

---

## Queues (Async Processing)

### Producer Pattern

```typescript
interface JobMessage {
  type: 'process_item' | 'send_notification' | 'sync_data';
  payload: Record<string, unknown>;
  createdAt: string;
}

// Send job to queue
app.post('/items/:id/process', async (c) => {
  const id = c.req.param('id');

  await c.env.JOBS_QUEUE.send({
    type: 'process_item',
    payload: { itemId: id },
    createdAt: new Date().toISOString(),
  } satisfies JobMessage);

  return c.json({ queued: true });
});

// Batch send
app.post('/batch-process', async (c) => {
  const { itemIds } = await c.req.json();

  const messages = itemIds.map((id: string) => ({
    body: {
      type: 'process_item',
      payload: { itemId: id },
      createdAt: new Date().toISOString(),
    },
  }));

  await c.env.JOBS_QUEUE.sendBatch(messages);

  return c.json({ queued: itemIds.length });
});
```

### Consumer Pattern

```typescript
export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<JobMessage>, env: Env) {
    for (const message of batch.messages) {
      const job = message.body;

      try {
        switch (job.type) {
          case 'process_item':
            await processItem(job.payload.itemId as string, env);
            break;
          case 'send_notification':
            await sendNotification(job.payload, env);
            break;
          case 'sync_data':
            await syncData(job.payload, env);
            break;
          default:
            console.error('Unknown job type:', job.type);
        }

        message.ack();
      } catch (error) {
        console.error('Job failed:', error);

        // Retry if under max retries, otherwise ack to prevent infinite loop
        if (message.attempts < 3) {
          message.retry({ delaySeconds: Math.pow(2, message.attempts) * 60 });
        } else {
          // Log failure and acknowledge
          await logFailedJob(env.DB, job, error);
          message.ack();
        }
      }
    }
  },
};
```

### Concurrency Control

In `wrangler.toml`:

```toml
[[queues.consumers]]
queue = "my-jobs"
max_batch_size = 10      # Process up to 10 messages at once
max_retries = 3          # Retry failed messages 3 times
max_concurrency = 5      # Run up to 5 consumer instances in parallel
```

### Progress Tracking

```typescript
// Store progress in database
interface JobProgress {
  id: string;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress_percent: number;
  current_step: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

async function updateJobProgress(
  db: D1Database,
  jobId: string,
  updates: Partial<JobProgress>
): Promise<void> {
  const sets = Object.entries(updates)
    .map(([key, _]) => `${key} = ?`)
    .join(', ');
  const values = Object.values(updates);

  await db.prepare(`UPDATE job_progress SET ${sets} WHERE id = ?`)
    .bind(...values, jobId)
    .run();
}

// In consumer
async function processItem(itemId: string, env: Env) {
  const jobId = crypto.randomUUID();

  await env.DB.prepare(
    'INSERT INTO job_progress (id, job_type, status, progress_percent, current_step, started_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
  ).bind(jobId, 'process_item', 'running', 0, 'Starting').run();

  try {
    await updateJobProgress(env.DB, jobId, { progress_percent: 25, current_step: 'Fetching data' });
    // ... do work

    await updateJobProgress(env.DB, jobId, { progress_percent: 50, current_step: 'Processing' });
    // ... do more work

    await updateJobProgress(env.DB, jobId, { progress_percent: 100, status: 'completed', completed_at: new Date().toISOString() });
  } catch (error) {
    await updateJobProgress(env.DB, jobId, { status: 'failed', error_message: String(error) });
    throw error;
  }
}
```

### Resumability Pattern

**CRITICAL**: For long-running operations, store identifiers immediately BEFORE starting work:

```typescript
// BAD: Start work, then store ID (loses progress on crash)
async function badPattern(env: Env, itemId: string) {
  const externalId = await startExternalProcess(itemId); // Takes 5 minutes
  await env.DB.prepare('UPDATE items SET external_id = ? WHERE id = ?')
    .bind(externalId, itemId).run();
  // If Worker crashes during processing, external_id is lost!
}

// GOOD: Store ID immediately, then poll for results
async function goodPattern(env: Env, itemId: string) {
  // Check for existing external process
  const existing = await env.DB.prepare(
    'SELECT external_id FROM items WHERE id = ?'
  ).bind(itemId).first<{ external_id: string | null }>();

  let externalId: string;

  if (existing?.external_id) {
    // Resume existing process
    externalId = existing.external_id;
  } else {
    // Start new process and store ID immediately
    externalId = await createExternalProcess(itemId);
    await env.DB.prepare(
      'UPDATE items SET external_id = ?, status = "processing" WHERE id = ?'
    ).bind(externalId, itemId).run();
  }

  // Now poll for results (safe to retry)
  const result = await pollUntilComplete(externalId);

  await env.DB.prepare(
    'UPDATE items SET result = ?, status = "completed" WHERE id = ?'
  ).bind(JSON.stringify(result), itemId).run();
}
```

---

## Pages (Frontend)

### React + Vite + Tailwind Setup

```bash
# Create project
npm create vite@latest portal -- --template react-ts
cd portal

# Add Tailwind
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Add shadcn/ui (recommended)
npx shadcn@latest init
npx shadcn@latest add button card input
```

**`tailwind.config.js`**:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### API Integration

```typescript
// src/lib/api.ts
const API_BASE = import.meta.env.PROD
  ? 'https://my-api.workers.dev'
  : '/api';  // Proxy in dev

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Typed API functions
export const api = {
  items: {
    list: () => fetchAPI<Item[]>('/items'),
    get: (id: string) => fetchAPI<Item>(`/items/${id}`),
    create: (data: CreateItem) => fetchAPI<Item>('/items', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: Partial<Item>) => fetchAPI<Item>(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => fetchAPI<void>(`/items/${id}`, { method: 'DELETE' }),
  },
  settings: {
    get: () => fetchAPI<Settings>('/settings'),
    update: (data: Settings) => fetchAPI<Settings>('/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  },
};
```

### Smart Polling Pattern

Poll faster when there's active work, slower when idle:

```typescript
// src/hooks/useSmartPolling.ts
import { useEffect, useCallback, useState } from 'react';

export function useSmartPolling<T>(
  fetchFn: () => Promise<T>,
  isActive: (data: T) => boolean,
  activeInterval = 5000,
  idleInterval = 30000
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = data && isActive(data) ? activeInterval : idleInterval;
    const timer = setInterval(fetchData, interval);
    return () => clearInterval(timer);
  }, [data, fetchData, isActive, activeInterval, idleInterval]);

  return { data, loading, error, refetch: fetchData };
}

// Usage
function ItemList() {
  const { data: items, loading } = useSmartPolling(
    () => api.items.list(),
    (items) => items.some(i => i.status === 'processing'),
    5000,   // 5s when processing
    30000   // 30s when idle
  );

  if (loading) return <div>Loading...</div>;
  return <div>{items?.map(i => <ItemCard key={i.id} item={i} />)}</div>;
}
```

### Build and Deploy

```bash
# Build
cd portal
npm run build

# Deploy to Pages
npx wrangler pages deploy dist --project-name=my-portal

# Or create project first (one-time)
npx wrangler pages project create my-portal --production-branch=main
npx wrangler pages deploy dist --project-name=my-portal
```

**IMPORTANT**: The project name must match exactly. Use `npx wrangler pages project list` to see existing projects.

---

## KV (Key-Value Store)

### When to Use KV vs D1

| Use KV When | Use D1 When |
|-------------|-------------|
| High read frequency | Need SQL queries |
| Simple key-value | Relational data |
| Caching | Complex queries |
| Session storage | Transactions needed |
| Configuration | Data relationships |

### Caching Pattern

```typescript
// Cache expensive operations
async function getCachedData(env: Env, key: string): Promise<Data | null> {
  // Try cache first
  const cached = await env.CACHE.get(key, 'json');
  if (cached) return cached as Data;

  // Fetch from source
  const data = await fetchExpensiveData();

  // Cache for 5 minutes
  await env.CACHE.put(key, JSON.stringify(data), { expirationTtl: 300 });

  return data;
}

// Invalidate cache
async function invalidateCache(env: Env, pattern: string): Promise<void> {
  const list = await env.CACHE.list({ prefix: pattern });
  for (const key of list.keys) {
    await env.CACHE.delete(key.name);
  }
}
```

### Session Storage

```typescript
interface Session {
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

async function createSession(env: Env, userId: string, email: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const session: Session = {
    userId,
    email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  };

  await env.CACHE.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: 7 * 24 * 60 * 60, // 7 days in seconds
  });

  return sessionId;
}

async function getSession(env: Env, sessionId: string): Promise<Session | null> {
  const data = await env.CACHE.get(`session:${sessionId}`, 'json');
  return data as Session | null;
}

async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.CACHE.delete(`session:${sessionId}`);
}
```

---

## Cron Triggers

### Configuration

```toml
# wrangler.toml
[triggers]
crons = [
  "0 6 * * *",      # Daily at 6 AM UTC
  "0 */4 * * *",    # Every 4 hours
  "*/15 * * * *",   # Every 15 minutes
  "0 0 * * 0",      # Weekly on Sunday at midnight
]
```

### Handler Pattern

```typescript
export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Use waitUntil for background work
    ctx.waitUntil(handleScheduledTask(event, env));
  },
};

async function handleScheduledTask(event: ScheduledEvent, env: Env) {
  const cron = event.cron;

  // Log task start
  await logTask(env.DB, 'scheduled', cron, 'started');

  try {
    switch (cron) {
      case '0 6 * * *':
        await dailyCleanup(env);
        break;
      case '0 */4 * * *':
        await syncExternalData(env);
        break;
      case '*/15 * * * *':
        await checkPendingJobs(env);
        break;
    }

    await logTask(env.DB, 'scheduled', cron, 'completed');
  } catch (error) {
    await logTask(env.DB, 'scheduled', cron, 'failed', String(error));
    throw error;
  }
}

async function logTask(
  db: D1Database,
  type: string,
  name: string,
  status: string,
  error?: string
) {
  await db.prepare(`
    INSERT INTO task_log (id, type, name, status, error, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).bind(crypto.randomUUID(), type, name, status, error || null).run();
}
```

---

## Deployment

### Resource Creation Order

```bash
# 1. Create D1 database (get database_id)
npx wrangler d1 create my-db

# 2. Create R2 bucket
npx wrangler r2 bucket create my-files

# 3. Create Queue
npx wrangler queues create my-jobs

# 4. Create KV namespace (optional)
npx wrangler kv namespace create CACHE

# 5. Update wrangler.toml with IDs

# 6. Apply database schema
npx wrangler d1 execute my-db --remote --file=./schema.sql

# 7. Deploy Worker
npx wrangler deploy

# 8. Build and deploy frontend
cd portal && npm run build
npx wrangler pages deploy dist --project-name=my-portal
```

### Deploy Script

```bash
#!/bin/bash
# deploy.sh
set -e

echo "Deploying API..."
cd api
npm install
npx wrangler deploy

echo "Deploying Portal..."
cd ../portal
npm install
npm run build
npx wrangler pages deploy dist --project-name=my-portal

echo "Done! API: https://my-api.workers.dev"
echo "Portal: https://my-portal.pages.dev"
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd api && npm install

      - name: Deploy Worker
        run: cd api && npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

  deploy-portal:
    runs-on: ubuntu-latest
    needs: deploy-api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install and build
        run: |
          cd portal
          npm install
          npm run build

      - name: Deploy Pages
        run: npx wrangler pages deploy portal/dist --project-name=my-portal
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

---

## Best Practices

### Error Handling

```typescript
// Always catch and handle errors appropriately
app.onError((err, c) => {
  // Log for debugging
  console.error({
    error: err.message,
    stack: err.stack,
    url: c.req.url,
    method: c.req.method,
  });

  // Don't expose internal errors to clients
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.statusCode);
  }

  return c.json({ error: 'Internal server error' }, 500);
});
```

### Logging Pattern

Use a journal table for audit trails:

```sql
CREATE TABLE IF NOT EXISTS journal (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,           -- 'api', 'queue', 'cron', 'system'
  action TEXT NOT NULL,           -- 'item_created', 'job_completed', etc.
  context TEXT,                   -- JSON with details
  entity_id TEXT,                 -- Related entity
  entity_type TEXT,               -- 'item', 'user', etc.
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_journal_source ON journal(source);
CREATE INDEX IF NOT EXISTS idx_journal_entity ON journal(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_journal_created ON journal(created_at);
```

```typescript
async function logJournal(
  db: D1Database,
  source: string,
  action: string,
  context?: Record<string, unknown>,
  entityId?: string,
  entityType?: string
) {
  await db.prepare(`
    INSERT INTO journal (id, source, action, context, entity_id, entity_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    source,
    action,
    context ? JSON.stringify(context) : null,
    entityId || null,
    entityType || null
  ).run();
}

// Usage
await logJournal(env.DB, 'api', 'item_created', { name: item.name }, item.id, 'item');
await logJournal(env.DB, 'queue', 'job_completed', { duration: 1234 }, jobId, 'job');
await logJournal(env.DB, 'cron', 'daily_cleanup', { deleted: 15 });
```

### Cost Optimization

Stay within free tier:

| Resource | Free Limit | Optimization |
|----------|------------|--------------|
| Workers | 100k req/day | Cache responses, batch operations |
| D1 Reads | 5M rows/day | Use indexes, limit queries |
| D1 Writes | 100k rows/day | Batch inserts, avoid unnecessary updates |
| R2 Storage | 10GB | Clean up old files, compress |
| R2 Operations | 1M/month | Cache metadata, batch deletes |

```typescript
// Batch database operations
const batch = items.map(item =>
  env.DB.prepare('INSERT INTO items (id, name) VALUES (?, ?)').bind(item.id, item.name)
);
await env.DB.batch(batch);  // One round-trip instead of N

// Use indexed queries
// BAD: Full table scan
const items = await env.DB.prepare('SELECT * FROM items WHERE name LIKE ?').bind('%search%').all();

// GOOD: Use indexed column
const items = await env.DB.prepare('SELECT * FROM items WHERE status = ? AND created_at > ?').bind('active', lastWeek).all();
```

### Security

```typescript
// Validate all input
const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

// Parameterize all queries (D1 does this automatically with .bind())
// NEVER do: `SELECT * FROM items WHERE id = '${id}'`
// ALWAYS do: db.prepare('SELECT * FROM items WHERE id = ?').bind(id)

// Sanitize output if rendering HTML
import { escape } from 'html-escaper';
const safeHtml = escape(userInput);

// Use HTTPS only (Cloudflare handles this)

// Store secrets in D1 settings, not code
const apiKey = await getSetting(env.DB, 'api_key');
```

---

## Common Gotchas

### 1. CORS Errors

**Problem**: Frontend can't call external APIs
**Solution**: Proxy through your Worker

```typescript
// Worker proxies external API calls
app.post('/api/external', async (c) => {
  const response = await fetch('https://external-api.com/endpoint', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: await c.req.text(),
  });
  return new Response(response.body, { headers: response.headers });
});
```

### 2. String Numbers from APIs

**Problem**: External APIs return numbers as strings
**Solution**: Always parse explicitly

```typescript
// BAD
const price = market.price;  // "0.65" (string!)

// GOOD
const price = parseFloat(market.price);  // 0.65
const count = parseInt(data.count, 10);
```

### 3. Pages Project Naming

**Problem**: "Project not found" on deploy
**Solution**: Check exact project name

```bash
# List existing projects
npx wrangler pages project list

# Use exact name from list
npx wrangler pages deploy dist --project-name=exact-name-here
```

### 4. Binding Name Mismatches

**Problem**: "Cannot read property of undefined"
**Solution**: Ensure wrangler.toml binding names match code

```toml
# wrangler.toml
[[d1_databases]]
binding = "DB"  # Must match exactly
```

```typescript
// Code
const result = await env.DB.prepare(...);  // DB must match binding
```

### 5. Queue Message Size

**Problem**: Large messages fail
**Solution**: Store data in D1/R2, send references

```typescript
// BAD: Large payload in message
await queue.send({ data: hugeObject });

// GOOD: Store data, send reference
const id = crypto.randomUUID();
await env.DB.prepare('INSERT INTO jobs (id, data) VALUES (?, ?)').bind(id, JSON.stringify(hugeObject)).run();
await queue.send({ jobId: id });
```

### 6. Free Tier Limits

| Resource | Limit | What Happens |
|----------|-------|--------------|
| Workers | 100k req/day | Requests fail with 429 |
| D1 Reads | 5M rows/day | Queries fail |
| D1 Storage | 5GB | Writes fail |
| R2 | 10GB | Uploads fail |

Monitor usage in Cloudflare dashboard. Consider paid plan for production.

---

## Recipes

### Authentication Pattern

```typescript
// Middleware
async function authMiddleware(c: Context, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    throw new AppError(401, 'Missing authentication token');
  }

  const session = await c.env.CACHE.get(`session:${token}`, 'json');
  if (!session) {
    throw new AppError(401, 'Invalid or expired token');
  }

  c.set('session', session);
  await next();
}

// Protected routes
app.use('/api/*', authMiddleware);
app.get('/api/me', (c) => c.json(c.get('session')));
```

### File Upload Flow

```typescript
app.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  // 1. Generate unique key
  const key = `uploads/${Date.now()}-${file.name}`;

  // 2. Upload to R2
  await c.env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // 3. Create database record
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO files (id, name, key, size, type, status)
    VALUES (?, ?, ?, ?, ?, 'uploaded')
  `).bind(id, file.name, key, file.size, file.type).run();

  // 4. Queue processing if needed
  await c.env.JOBS_QUEUE.send({ type: 'process_file', fileId: id });

  return c.json({ id, key });
});
```

### Background Job Pattern

```typescript
// 1. Create job record
app.post('/jobs', async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO jobs (id, type, input, status) VALUES (?, ?, ?, 'pending')
  `).bind(id, body.type, JSON.stringify(body.input)).run();

  await c.env.JOBS_QUEUE.send({ jobId: id });

  return c.json({ id, status: 'pending' });
});

// 2. Poll for status
app.get('/jobs/:id', async (c) => {
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?')
    .bind(c.req.param('id')).first();
  return c.json(job);
});

// 3. Consumer processes job
async function processJob(jobId: string, env: Env) {
  await env.DB.prepare('UPDATE jobs SET status = "running" WHERE id = ?').bind(jobId).run();

  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(jobId).first();
  const input = JSON.parse(job.input);

  // Do work...
  const result = await doExpensiveWork(input);

  await env.DB.prepare('UPDATE jobs SET status = "completed", output = ? WHERE id = ?')
    .bind(JSON.stringify(result), jobId).run();
}
```

---

## Summary

This guide covers the complete Cloudflare stack for building production applications:

1. **Workers** - API and compute with Hono
2. **D1** - SQL database for structured data
3. **R2** - Object storage for files
4. **Queues** - Async job processing
5. **Pages** - Static frontend hosting
6. **KV** - Fast key-value cache
7. **Cron** - Scheduled tasks

Key patterns:
- Store settings in D1, not environment variables
- Proxy external APIs through Workers (CORS)
- Store IDs immediately for resumability
- Use smart polling (fast when active, slow when idle)
- Batch operations to stay within free tier

The Cloudflare stack is ideal for MOSSKits because:
- Free tier is generous enough for real apps
- Global edge deployment out of the box
- Single vendor, integrated tooling
- Simple deployment with wrangler

---

*Build fast. Deploy globally. Stay within free tier.*
