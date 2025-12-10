import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  QUEUE: Queue;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS for portal access
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0' }));

// ============== SETTINGS ==============

app.get('/settings', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT key, value FROM settings'
  ).all();

  const settings: Record<string, string> = {};
  for (const row of result.results as { key: string; value: string }[]) {
    // Don't expose full API keys
    if (row.key.includes('api_key')) {
      settings[row.key] = row.value ? '••••••••' + row.value.slice(-4) : '';
    } else {
      settings[row.key] = row.value;
    }
  }
  return c.json(settings);
});

app.post('/settings', async (c) => {
  const body = await c.req.json();

  for (const [key, value] of Object.entries(body)) {
    // Skip masked values (don't overwrite with masked placeholder)
    if (typeof value === 'string' && value.startsWith('••••')) continue;

    await c.env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`
    ).bind(key, value, value).run();
  }

  return c.json({ success: true });
});

// Helper to get a setting
async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const result = await db.prepare(
    'SELECT value FROM settings WHERE key = ?'
  ).bind(key).first<{ value: string }>();
  return result?.value ?? null;
}

// ============== RECORDINGS ==============

app.get('/recordings', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT r.*, m.title, m.summary
    FROM recordings r
    LEFT JOIN memories m ON m.recording_id = r.id
    ORDER BY r.created_at DESC
  `).all();

  return c.json(result.results);
});

app.get('/recordings/:id', async (c) => {
  const id = c.req.param('id');

  // Get recording
  const recording = await c.env.DB.prepare(
    'SELECT * FROM recordings WHERE id = ?'
  ).bind(id).first();

  if (!recording) {
    return c.json({ error: 'Recording not found' }, 404);
  }

  // Get transcript
  const transcript = await c.env.DB.prepare(
    'SELECT * FROM transcripts WHERE recording_id = ?'
  ).bind(id).first();

  // Get segments if transcript exists
  let segments: unknown[] = [];
  if (transcript) {
    const segResult = await c.env.DB.prepare(
      'SELECT * FROM transcript_segments WHERE transcript_id = ? ORDER BY start_ms'
    ).bind((transcript as { id: string }).id).all();
    segments = segResult.results;
  }

  // Get memory
  const memory = await c.env.DB.prepare(
    'SELECT * FROM memories WHERE recording_id = ?'
  ).bind(id).first();

  // Get moments if memory exists
  let moments: unknown[] = [];
  if (memory) {
    const momResult = await c.env.DB.prepare(
      'SELECT * FROM moments WHERE memory_id = ?'
    ).bind((memory as { id: string }).id).all();
    moments = momResult.results;
  }

  // Get entities mentioned in this recording
  const entitiesResult = await c.env.DB.prepare(`
    SELECT e.*, m.quote, m.context
    FROM entities e
    JOIN mentions m ON m.entity_id = e.id
    WHERE m.recording_id = ?
  `).bind(id).all();

  return c.json({
    ...recording,
    transcript: transcript ? {
      ...(transcript as object),
      segments
    } : null,
    memory: memory ? {
      ...(memory as object),
      moments
    } : null,
    entities: entitiesResult.results
  });
});

app.delete('/recordings/:id', async (c) => {
  const id = c.req.param('id');

  // Get recording to find file key
  const recording = await c.env.DB.prepare(
    'SELECT audio_key FROM recordings WHERE id = ?'
  ).bind(id).first<{ audio_key: string }>();

  if (!recording) {
    return c.json({ error: 'Recording not found' }, 404);
  }

  // Delete from R2
  await c.env.FILES.delete(recording.audio_key);

  // Delete from D1 (cascades handle related records)
  await c.env.DB.prepare('DELETE FROM recordings WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

// ============== UPLOAD ==============

app.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const id = crypto.randomUUID();
  const ext = file.name.split('.').pop() || 'audio';
  const key = `audio/${id}.${ext}`;

  // Upload to R2
  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type }
  });

  // Create recording record
  await c.env.DB.prepare(`
    INSERT INTO recordings (id, filename, audio_key, status)
    VALUES (?, ?, ?, 'processing')
  `).bind(id, file.name, key).run();

  // Queue for processing
  await c.env.QUEUE.send({ recordingId: id });

  return c.json({ id, filename: file.name, status: 'processing' });
});

// Get audio file URL (presigned)
app.get('/recordings/:id/audio', async (c) => {
  const id = c.req.param('id');

  const recording = await c.env.DB.prepare(
    'SELECT audio_key FROM recordings WHERE id = ?'
  ).bind(id).first<{ audio_key: string }>();

  if (!recording) {
    return c.json({ error: 'Recording not found' }, 404);
  }

  const object = await c.env.FILES.get(recording.audio_key);
  if (!object) {
    return c.json({ error: 'File not found' }, 404);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'audio/mpeg',
      'Content-Length': object.size.toString(),
    }
  });
});

// ============== MANUAL TRIGGERS ==============

app.post('/recordings/:id/transcribe', async (c) => {
  const id = c.req.param('id');

  await c.env.DB.prepare(
    `UPDATE recordings SET status = 'processing', processing_phase = 'transcribing' WHERE id = ?`
  ).bind(id).run();

  await c.env.QUEUE.send({ recordingId: id, action: 'transcribe' });

  return c.json({ success: true });
});

app.post('/recordings/:id/summarize', async (c) => {
  const id = c.req.param('id');

  await c.env.DB.prepare(
    `UPDATE recordings SET status = 'processing', processing_phase = 'compiling' WHERE id = ?`
  ).bind(id).run();

  await c.env.QUEUE.send({ recordingId: id, action: 'summarize' });

  return c.json({ success: true });
});

// ============== ENTITIES ==============

app.get('/entities', async (c) => {
  const type = c.req.query('type');

  let query = `
    SELECT e.*, COUNT(m.id) as mention_count
    FROM entities e
    LEFT JOIN mentions m ON m.entity_id = e.id
  `;

  if (type) {
    query += ` WHERE e.type = ?`;
  }

  query += ` GROUP BY e.id ORDER BY mention_count DESC`;

  const result = type
    ? await c.env.DB.prepare(query).bind(type).all()
    : await c.env.DB.prepare(query).all();

  return c.json(result.results);
});

app.get('/entities/:id', async (c) => {
  const id = c.req.param('id');

  const entity = await c.env.DB.prepare(
    'SELECT * FROM entities WHERE id = ?'
  ).bind(id).first();

  if (!entity) {
    return c.json({ error: 'Entity not found' }, 404);
  }

  // Get all mentions
  const mentions = await c.env.DB.prepare(`
    SELECT m.*, r.filename, r.created_at as recording_date
    FROM mentions m
    JOIN recordings r ON r.id = m.recording_id
    WHERE m.entity_id = ?
    ORDER BY r.created_at DESC
  `).bind(id).all();

  // Get connections
  const connections = await c.env.DB.prepare(`
    SELECT c.*, e.name as related_name, e.type as related_type
    FROM connections c
    JOIN entities e ON e.id = c.related_entity_id
    WHERE c.entity_id = ?
  `).bind(id).all();

  return c.json({
    ...entity,
    mentions: mentions.results,
    connections: connections.results
  });
});

// ============== SEARCH ==============

app.get('/search', async (c) => {
  const query = c.req.query('q');

  if (!query) {
    return c.json({ error: 'Query required' }, 400);
  }

  // Search in transcripts
  const transcriptResults = await c.env.DB.prepare(`
    SELECT r.*, t.full_text, m.title, m.summary
    FROM recordings r
    JOIN transcripts t ON t.recording_id = r.id
    LEFT JOIN memories m ON m.recording_id = r.id
    WHERE t.full_text LIKE ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).bind(`%${query}%`).all();

  // Search in entities
  const entityResults = await c.env.DB.prepare(`
    SELECT * FROM entities
    WHERE name LIKE ? OR portrait LIKE ?
    ORDER BY confidence DESC
    LIMIT 20
  `).bind(`%${query}%`, `%${query}%`).all();

  return c.json({
    recordings: transcriptResults.results,
    entities: entityResults.results
  });
});

// ============== ASK (Memory Agent) ==============

app.post('/ask', async (c) => {
  const { question, recordingId } = await c.req.json();

  const claudeKey = await getSetting(c.env.DB, 'claude_api_key');
  if (!claudeKey) {
    return c.json({ error: 'Claude API key not configured' }, 400);
  }

  // Gather context
  let context = '';

  if (recordingId) {
    // Single recording context
    const recording = await c.env.DB.prepare(`
      SELECT r.*, t.full_text, m.title, m.summary
      FROM recordings r
      LEFT JOIN transcripts t ON t.recording_id = r.id
      LEFT JOIN memories m ON m.recording_id = r.id
      WHERE r.id = ?
    `).bind(recordingId).first();

    if (recording) {
      context = `Recording: ${(recording as { filename: string }).filename}\n`;
      if ((recording as { title?: string }).title) context += `Title: ${(recording as { title: string }).title}\n`;
      if ((recording as { summary?: string }).summary) context += `Summary: ${(recording as { summary: string }).summary}\n`;
      if ((recording as { full_text?: string }).full_text) context += `Transcript:\n${(recording as { full_text: string }).full_text}\n`;
    }
  } else {
    // Corpus-wide context - search for relevant recordings
    const searchResults = await c.env.DB.prepare(`
      SELECT r.filename, r.created_at, t.full_text, m.title, m.summary
      FROM recordings r
      LEFT JOIN transcripts t ON t.recording_id = r.id
      LEFT JOIN memories m ON m.recording_id = r.id
      WHERE r.status = 'completed'
      ORDER BY r.created_at DESC
      LIMIT 10
    `).all();

    for (const rec of searchResults.results as { filename: string; created_at: string; title?: string; summary?: string; full_text?: string }[]) {
      context += `\n--- Recording: ${rec.filename} (${rec.created_at}) ---\n`;
      if (rec.title) context += `Title: ${rec.title}\n`;
      if (rec.summary) context += `Summary: ${rec.summary}\n`;
      if (rec.full_text) context += `Transcript excerpt: ${rec.full_text.slice(0, 1000)}...\n`;
    }

    // Include entities
    const entities = await c.env.DB.prepare(`
      SELECT name, type, portrait FROM entities LIMIT 20
    `).all();

    if (entities.results.length > 0) {
      context += '\n--- Known Entities ---\n';
      for (const ent of entities.results as { name: string; type: string; portrait?: string }[]) {
        context += `${ent.name} (${ent.type}): ${ent.portrait || 'No description'}\n`;
      }
    }
  }

  // Call Claude
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `You are a personal memory companion. You have access to the user's recordings, transcripts, and entities.
Search and synthesize — never fabricate. Always cite sources: which recording, which quote, what timestamp when available.
Be concise but complete.`,
      messages: [
        {
          role: 'user',
          content: `Context from memory:\n${context}\n\nQuestion: ${question}`
        }
      ]
    })
  });

  const result = await response.json() as { content?: { text: string }[]; error?: { message: string } };

  if (!response.ok) {
    return c.json({ error: result.error?.message || 'Claude API error' }, 500);
  }

  return c.json({
    answer: result.content?.[0]?.text || '',
    sources: [] // TODO: parse citations from response
  });
});

// ============== QUEUE CONSUMER ==============

async function processRecording(
  batch: MessageBatch<{ recordingId: string; action?: string }>,
  env: Bindings
) {
  for (const message of batch.messages) {
    const { recordingId, action } = message.body;

    try {
      const recording = await env.DB.prepare(
        'SELECT * FROM recordings WHERE id = ?'
      ).bind(recordingId).first<{
        id: string;
        audio_key: string;
        status: string;
      }>();

      if (!recording) {
        message.ack();
        continue;
      }

      const deepgramKey = await getSetting(env.DB, 'deepgram_api_key');
      const claudeKey = await getSetting(env.DB, 'claude_api_key');

      if (!deepgramKey || !claudeKey) {
        await env.DB.prepare(
          `UPDATE recordings SET status = 'failed', error_message = 'API keys not configured' WHERE id = ?`
        ).bind(recordingId).run();
        message.ack();
        continue;
      }

      // Phase 1: Transcribe
      if (!action || action === 'transcribe') {
        await env.DB.prepare(
          `UPDATE recordings SET processing_phase = 'transcribing' WHERE id = ?`
        ).bind(recordingId).run();

        // Get audio from R2
        const audioObject = await env.FILES.get(recording.audio_key);
        if (!audioObject) {
          throw new Error('Audio file not found');
        }

        // Call Deepgram
        const audioBuffer = await audioObject.arrayBuffer();
        const dgResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&paragraphs=true', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${deepgramKey}`,
            'Content-Type': audioObject.httpMetadata?.contentType || 'audio/mpeg'
          },
          body: audioBuffer
        });

        if (!dgResponse.ok) {
          const error = await dgResponse.text();
          throw new Error(`Deepgram error: ${error}`);
        }

        const dgResult = await dgResponse.json() as {
          results?: {
            channels?: Array<{
              alternatives?: Array<{
                transcript?: string;
                paragraphs?: {
                  paragraphs?: Array<{
                    speaker?: number;
                    sentences?: Array<{
                      text?: string;
                      start?: number;
                      end?: number;
                    }>;
                  }>;
                };
              }>;
            }>;
          };
          metadata?: {
            duration?: number;
          };
        };

        const transcript = dgResult.results?.channels?.[0]?.alternatives?.[0];
        const fullText = transcript?.transcript || '';

        // Save transcript
        const transcriptId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO transcripts (id, recording_id, full_text) VALUES (?, ?, ?)`
        ).bind(transcriptId, recordingId, fullText).run();

        // Save segments with speaker diarization
        const paragraphs = transcript?.paragraphs?.paragraphs || [];
        const speakers = new Set<number>();

        for (const para of paragraphs) {
          const speaker = para.speaker ?? 0;
          speakers.add(speaker);

          for (const sentence of para.sentences || []) {
            const segmentId = crypto.randomUUID();
            await env.DB.prepare(
              `INSERT INTO transcript_segments (id, transcript_id, speaker, text, start_ms, end_ms)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
              segmentId,
              transcriptId,
              `Speaker ${speaker + 1}`,
              sentence.text || '',
              Math.floor((sentence.start || 0) * 1000),
              Math.floor((sentence.end || 0) * 1000)
            ).run();
          }
        }

        // Update recording with duration and speaker count
        const duration = dgResult.metadata?.duration || 0;
        await env.DB.prepare(
          `UPDATE recordings SET duration_seconds = ?, speaker_count = ? WHERE id = ?`
        ).bind(Math.floor(duration), speakers.size, recordingId).run();
      }

      // Phase 2: Extract entities
      if (!action || action === 'extract') {
        await env.DB.prepare(
          `UPDATE recordings SET processing_phase = 'extracting' WHERE id = ?`
        ).bind(recordingId).run();

        // Get transcript
        const transcript = await env.DB.prepare(
          'SELECT full_text FROM transcripts WHERE recording_id = ?'
        ).bind(recordingId).first<{ full_text: string }>();

        if (transcript?.full_text) {
          const extractResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': claudeKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 4096,
              system: `Extract entities from the transcript. Return JSON array with objects containing:
- name: string (the entity name)
- type: "person" | "place" | "thing" | "pattern" | "era" | "phrase"
- portrait: string (brief description based on context)
- quotes: string[] (relevant quotes mentioning this entity)

Only extract clearly identifiable entities. Return valid JSON array only, no other text.`,
              messages: [
                { role: 'user', content: transcript.full_text }
              ]
            })
          });

          if (extractResponse.ok) {
            const extractResult = await extractResponse.json() as { content?: { text: string }[] };
            const entitiesText = extractResult.content?.[0]?.text || '[]';

            try {
              const entities = JSON.parse(entitiesText) as Array<{
                name: string;
                type: string;
                portrait?: string;
                quotes?: string[];
              }>;

              for (const entity of entities) {
                // Check if entity exists
                const existing = await env.DB.prepare(
                  'SELECT id FROM entities WHERE name = ?'
                ).bind(entity.name).first<{ id: string }>();

                let entityId: string;

                if (existing) {
                  entityId = existing.id;
                  // Update confidence based on mention count
                  const mentionCount = await env.DB.prepare(
                    'SELECT COUNT(*) as count FROM mentions WHERE entity_id = ?'
                  ).bind(entityId).first<{ count: number }>();

                  const count = (mentionCount?.count || 0) + 1;
                  const confidence = count >= 5 ? 'established' : count >= 2 ? 'developing' : 'emerging';

                  await env.DB.prepare(
                    `UPDATE entities SET confidence = ?, updated_at = datetime('now') WHERE id = ?`
                  ).bind(confidence, entityId).run();
                } else {
                  entityId = crypto.randomUUID();
                  await env.DB.prepare(
                    `INSERT INTO entities (id, name, type, portrait) VALUES (?, ?, ?, ?)`
                  ).bind(entityId, entity.name, entity.type, entity.portrait || null).run();
                }

                // Add mentions
                for (const quote of entity.quotes || []) {
                  const mentionId = crypto.randomUUID();
                  await env.DB.prepare(
                    `INSERT INTO mentions (id, entity_id, recording_id, quote) VALUES (?, ?, ?, ?)`
                  ).bind(mentionId, entityId, recordingId, quote).run();
                }
              }
            } catch {
              console.error('Failed to parse entities JSON');
            }
          }
        }
      }

      // Phase 3: Compile memory
      if (!action || action === 'summarize') {
        await env.DB.prepare(
          `UPDATE recordings SET processing_phase = 'compiling' WHERE id = ?`
        ).bind(recordingId).run();

        const transcript = await env.DB.prepare(
          'SELECT full_text FROM transcripts WHERE recording_id = ?'
        ).bind(recordingId).first<{ full_text: string }>();

        if (transcript?.full_text) {
          const compileResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': claudeKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 2048,
              system: `Compile a memory from the transcript. Return JSON with:
- title: string (concise, descriptive title)
- summary: string (what happened, 2-3 sentences)
- moments: array of { quote: string, context: string, significance: string }

Return valid JSON only, no other text.`,
              messages: [
                { role: 'user', content: transcript.full_text }
              ]
            })
          });

          if (compileResponse.ok) {
            const compileResult = await compileResponse.json() as { content?: { text: string }[] };
            const memoryText = compileResult.content?.[0]?.text || '{}';

            try {
              const memory = JSON.parse(memoryText) as {
                title?: string;
                summary?: string;
                moments?: Array<{ quote: string; context?: string; significance?: string }>;
              };

              // Delete existing memory if any
              await env.DB.prepare(
                'DELETE FROM memories WHERE recording_id = ?'
              ).bind(recordingId).run();

              const memoryId = crypto.randomUUID();
              await env.DB.prepare(
                `INSERT INTO memories (id, recording_id, title, summary) VALUES (?, ?, ?, ?)`
              ).bind(memoryId, recordingId, memory.title || 'Untitled', memory.summary || '').run();

              for (const moment of memory.moments || []) {
                const momentId = crypto.randomUUID();
                await env.DB.prepare(
                  `INSERT INTO moments (id, memory_id, quote, context, significance) VALUES (?, ?, ?, ?, ?)`
                ).bind(momentId, memoryId, moment.quote, moment.context || null, moment.significance || null).run();
              }
            } catch {
              console.error('Failed to parse memory JSON');
            }
          }
        }
      }

      // Mark as completed
      await env.DB.prepare(
        `UPDATE recordings SET status = 'completed', processing_phase = NULL WHERE id = ?`
      ).bind(recordingId).run();

      message.ack();
    } catch (error) {
      console.error('Processing error:', error);

      await env.DB.prepare(
        `UPDATE recordings SET status = 'failed', error_message = ? WHERE id = ?`
      ).bind(String(error), recordingId).run();

      message.ack(); // Don't retry on error
    }
  }
}

export default {
  fetch: app.fetch,
  queue: processRecording
};
