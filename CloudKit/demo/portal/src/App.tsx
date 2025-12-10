import { useState, useEffect, useRef, useCallback } from 'react';

// TODO: Update this URL after deploying your API
const API_URL = import.meta.env.PROD
  ? 'https://cloudkit-api.YOUR_SUBDOMAIN.workers.dev'
  : 'http://localhost:8787';

type Recording = {
  id: string;
  filename: string;
  audio_key: string;
  duration_seconds: number | null;
  speaker_count: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  processing_phase: 'transcribing' | 'extracting' | 'compiling' | null;
  error_message: string | null;
  created_at: string;
  title?: string;
  summary?: string;
};

type RecordingDetail = Recording & {
  transcript: {
    id: string;
    full_text: string;
    segments: Array<{
      id: string;
      speaker: string;
      text: string;
      start_ms: number;
      end_ms: number;
    }>;
  } | null;
  memory: {
    id: string;
    title: string;
    summary: string;
    moments: Array<{
      id: string;
      quote: string;
      context: string | null;
      significance: string | null;
    }>;
  } | null;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    quote: string;
  }>;
};

type Entity = {
  id: string;
  name: string;
  type: string;
  portrait: string | null;
  confidence: 'emerging' | 'developing' | 'established';
  mention_count: number;
};

type EntityDetail = Entity & {
  mentions: Array<{
    id: string;
    quote: string;
    context: string | null;
    recording_id: string;
    filename: string;
    recording_date: string;
  }>;
  connections: Array<{
    id: string;
    related_entity_id: string;
    related_name: string;
    related_type: string;
    relationship: string;
  }>;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type View = 'library' | 'entities' | 'settings';
type Filter = 'all' | 'today' | 'week';
type EntityType = 'all' | 'person' | 'place' | 'thing' | 'pattern' | 'era' | 'phrase';

export default function App() {
  const [view, setView] = useState<View>('library');
  const [filter, setFilter] = useState<Filter>('all');
  const [entityType, setEntityType] = useState<EntityType>('all');
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<RecordingDetail | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityDetail | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [settings, setSettings] = useState({
    deepgram_api_key: '',
    claude_api_key: '',
    theme: 'light'
  });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    recording: Recording;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<number | undefined>(undefined);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Fetch recordings
  const fetchRecordings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/recordings`);
      const data = await res.json() as Recording[];
      setRecordings(data);
    } catch (err) {
      console.error('Failed to fetch recordings:', err);
    }
  }, []);

  // Fetch entities
  const fetchEntities = useCallback(async () => {
    try {
      const url = entityType === 'all'
        ? `${API_URL}/entities`
        : `${API_URL}/entities?type=${entityType}`;
      const res = await fetch(url);
      const data = await res.json() as Entity[];
      setEntities(data);
    } catch (err) {
      console.error('Failed to fetch entities:', err);
    }
  }, [entityType]);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/settings`);
      const data = await res.json() as Record<string, string>;
      setSettings({
        deepgram_api_key: data.deepgram_api_key || '',
        claude_api_key: data.claude_api_key || '',
        theme: data.theme || 'light'
      });
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([fetchRecordings(), fetchSettings()]).finally(() => {
      setIsLoading(false);
    });
  }, [fetchRecordings, fetchSettings]);

  // Fetch entities when viewing entities
  useEffect(() => {
    if (view === 'entities') {
      fetchEntities();
    }
  }, [view, entityType, fetchEntities]);

  // Poll for processing updates
  useEffect(() => {
    const hasProcessing = recordings.some(r => r.status === 'processing');
    if (hasProcessing) {
      pollIntervalRef.current = window.setInterval(fetchRecordings, 3000);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [recordings, fetchRecordings]);

  // Filter recordings
  const filteredRecordings = recordings.filter(r => {
    if (filter === 'all') return true;
    const date = new Date(r.created_at);
    const now = new Date();
    if (filter === 'today') {
      return date.toDateString() === now.toDateString();
    }
    if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= weekAgo;
    }
    return true;
  });

  // Upload file
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        await fetch(`${API_URL}/upload`, {
          method: 'POST',
          body: formData
        });
      }
      await fetchRecordings();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Load recording detail
  const loadRecordingDetail = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/recordings/${id}`);
      const data = await res.json() as RecordingDetail;
      setSelectedRecording(data);
    } catch (err) {
      console.error('Failed to load recording:', err);
    }
  };

  // Load entity detail
  const loadEntityDetail = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/entities/${id}`);
      const data = await res.json() as EntityDetail;
      setSelectedEntity(data);
    } catch (err) {
      console.error('Failed to load entity:', err);
    }
  };

  // Delete recording
  const deleteRecording = async (id: string) => {
    if (!confirm('Delete this recording? This cannot be undone.')) return;
    try {
      await fetch(`${API_URL}/recordings/${id}`, { method: 'DELETE' });
      setSelectedRecording(null);
      await fetchRecordings();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Trigger reprocessing
  const triggerAction = async (id: string, action: 'transcribe' | 'summarize') => {
    try {
      await fetch(`${API_URL}/recordings/${id}/${action}`, { method: 'POST' });
      await fetchRecordings();
    } catch (err) {
      console.error('Action failed:', err);
    }
    setContextMenu(null);
  };

  // Save settings
  const saveSettings = async () => {
    try {
      await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setShowSettings(false);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  // Send chat message
  const sendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          recordingId: selectedRecording?.id
        })
      });

      const data = await res.json() as { answer?: string; error?: string };

      if (data.error) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${data.error}`
        }]);
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer || 'No response'
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to get response. Please try again.'
      }]);
    }
  };

  // Format duration
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format timestamp
  const formatTimestamp = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  if (isLoading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="window-controls">
            <div className="window-dot red" />
            <div className="window-dot yellow" />
            <div className="window-dot green" />
          </div>
          <span className="app-title">CloudKit</span>
        </div>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙️
          </button>
          <button
            className={`icon-btn ${showChat ? 'active' : ''}`}
            onClick={() => setShowChat(!showChat)}
            title="CloudKit AI"
          >
            💬
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Library</div>
            <div
              className={`sidebar-item ${view === 'library' && filter === 'all' ? 'active' : ''}`}
              onClick={() => { setView('library'); setFilter('all'); setSelectedRecording(null); }}
            >
              <span className="sidebar-item-icon">📁</span>
              All
              <span className="sidebar-item-count">{recordings.length}</span>
            </div>
            <div
              className={`sidebar-item ${view === 'library' && filter === 'today' ? 'active' : ''}`}
              onClick={() => { setView('library'); setFilter('today'); setSelectedRecording(null); }}
            >
              <span className="sidebar-item-icon">📅</span>
              Today
            </div>
            <div
              className={`sidebar-item ${view === 'library' && filter === 'week' ? 'active' : ''}`}
              onClick={() => { setView('library'); setFilter('week'); setSelectedRecording(null); }}
            >
              <span className="sidebar-item-icon">📆</span>
              This Week
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-title">Entities</div>
            <div
              className={`sidebar-item ${view === 'entities' && entityType === 'person' ? 'active' : ''}`}
              onClick={() => { setView('entities'); setEntityType('person'); setSelectedEntity(null); }}
            >
              <span className="sidebar-item-icon">👤</span>
              People
            </div>
            <div
              className={`sidebar-item ${view === 'entities' && entityType === 'place' ? 'active' : ''}`}
              onClick={() => { setView('entities'); setEntityType('place'); setSelectedEntity(null); }}
            >
              <span className="sidebar-item-icon">📍</span>
              Places
            </div>
            <div
              className={`sidebar-item ${view === 'entities' && entityType === 'thing' ? 'active' : ''}`}
              onClick={() => { setView('entities'); setEntityType('thing'); setSelectedEntity(null); }}
            >
              <span className="sidebar-item-icon">💡</span>
              Ideas
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="content">
          {view === 'library' && !selectedRecording && (
            <>
              <div className="content-header">
                <h1 className="content-title">
                  {filter === 'all' ? 'All Recordings' : filter === 'today' ? 'Today' : 'This Week'}
                </h1>
              </div>
              <div className="content-body">
                {/* Upload Zone */}
                <div
                  className={`upload-zone ${isDragging ? 'dragover' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleUpload(e.dataTransfer.files);
                  }}
                >
                  <div className="upload-zone-icon">🎙️</div>
                  <p className="upload-zone-text">
                    {isUploading ? (
                      <>Uploading...</>
                    ) : (
                      <>Drop audio files here or <strong>click to browse</strong></>
                    )}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleUpload(e.target.files)}
                  />
                </div>

                {/* Recording List */}
                {filteredRecordings.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">🎧</div>
                    <p>No recordings yet. Upload your first audio file.</p>
                  </div>
                ) : (
                  <div className="recording-list">
                    {filteredRecordings.map(recording => (
                      <div
                        key={recording.id}
                        className="recording-item"
                        onClick={() => loadRecordingDetail(recording.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, recording });
                        }}
                      >
                        <div className="recording-icon">🎙️</div>
                        <div className="recording-info">
                          <div className="recording-name">
                            {recording.title || recording.filename}
                          </div>
                          <div className="recording-meta">
                            <span>{formatDuration(recording.duration_seconds)}</span>
                            {recording.speaker_count > 0 && (
                              <span>{recording.speaker_count} speaker{recording.speaker_count !== 1 ? 's' : ''}</span>
                            )}
                            <span>{new Date(recording.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="recording-status">
                          {recording.status === 'completed' && (
                            <span className="status-badge completed">✓ Done</span>
                          )}
                          {recording.status === 'processing' && (
                            <span className="status-badge processing">
                              {recording.processing_phase === 'transcribing' && 'Transcribing...'}
                              {recording.processing_phase === 'extracting' && 'Extracting...'}
                              {recording.processing_phase === 'compiling' && 'Compiling...'}
                              {!recording.processing_phase && 'Processing...'}
                            </span>
                          )}
                          {recording.status === 'failed' && (
                            <span className="status-badge failed">Failed</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {view === 'library' && selectedRecording && (
            <>
              <div className="content-header">
                <h1 className="content-title">Recording</h1>
              </div>
              <div className="content-body">
                <div className="detail-view">
                  <div
                    className="back-btn"
                    onClick={() => setSelectedRecording(null)}
                  >
                    ← Back to Library
                  </div>

                  <div className="detail-header">
                    <h1 className="detail-title">
                      {selectedRecording.memory?.title || selectedRecording.filename}
                    </h1>
                    <div className="detail-meta">
                      <span>{formatDuration(selectedRecording.duration_seconds)}</span>
                      {selectedRecording.speaker_count > 0 && (
                        <span>{selectedRecording.speaker_count} speakers</span>
                      )}
                      <span>{new Date(selectedRecording.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {selectedRecording.memory?.summary && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Summary</h3>
                      <p className="detail-summary">{selectedRecording.memory.summary}</p>
                    </div>
                  )}

                  {selectedRecording.memory?.moments && selectedRecording.memory.moments.length > 0 && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Key Moments</h3>
                      {selectedRecording.memory.moments.map(moment => (
                        <div key={moment.id} className="moment-card">
                          <p className="moment-quote">"{moment.quote}"</p>
                          {moment.significance && (
                            <p className="moment-context">{moment.significance}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedRecording.entities && selectedRecording.entities.length > 0 && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Entities</h3>
                      <div>
                        {selectedRecording.entities.map(entity => (
                          <span
                            key={entity.id}
                            className="entity-tag"
                            onClick={() => {
                              setView('entities');
                              loadEntityDetail(entity.id);
                            }}
                          >
                            {entity.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedRecording.transcript?.segments && selectedRecording.transcript.segments.length > 0 && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Transcript</h3>
                      {selectedRecording.transcript.segments.map(segment => (
                        <div key={segment.id} className="transcript-segment">
                          <div className="transcript-speaker">
                            {segment.speaker}
                            <span style={{ fontWeight: 'normal', marginLeft: 8, color: 'var(--text-secondary)' }}>
                              {formatTimestamp(segment.start_ms)}
                            </span>
                          </div>
                          <p className="transcript-text">{segment.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => deleteRecording(selectedRecording.id)}
                    >
                      Delete Recording
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {view === 'entities' && !selectedEntity && (
            <>
              <div className="content-header">
                <h1 className="content-title">
                  {entityType === 'person' ? 'People' :
                   entityType === 'place' ? 'Places' :
                   entityType === 'thing' ? 'Ideas' : 'All Entities'}
                </h1>
              </div>
              <div className="content-body">
                {entities.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">🔍</div>
                    <p>No entities found. They'll appear after processing recordings.</p>
                  </div>
                ) : (
                  <div className="entity-grid">
                    {entities.map(entity => (
                      <div
                        key={entity.id}
                        className="entity-card"
                        onClick={() => loadEntityDetail(entity.id)}
                      >
                        <div className="entity-name">
                          {entity.name}
                          <span className="confidence-indicator">
                            <span className={`confidence-dot ${entity.confidence !== 'emerging' ? 'filled' : ''}`} />
                            <span className={`confidence-dot ${entity.confidence === 'established' ? 'filled' : ''}`} />
                          </span>
                        </div>
                        <div className="entity-type">{entity.type}</div>
                        {entity.portrait && (
                          <p className="entity-portrait">{entity.portrait}</p>
                        )}
                        <div className="entity-mentions">
                          {entity.mention_count} mention{entity.mention_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {view === 'entities' && selectedEntity && (
            <>
              <div className="content-header">
                <h1 className="content-title">Entity</h1>
              </div>
              <div className="content-body">
                <div className="detail-view">
                  <div
                    className="back-btn"
                    onClick={() => setSelectedEntity(null)}
                  >
                    ← Back to Entities
                  </div>

                  <div className="detail-header">
                    <h1 className="detail-title">{selectedEntity.name}</h1>
                    <div className="detail-meta">
                      <span style={{ textTransform: 'capitalize' }}>{selectedEntity.type}</span>
                      <span>{selectedEntity.confidence}</span>
                    </div>
                  </div>

                  {selectedEntity.portrait && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Portrait</h3>
                      <p className="detail-summary">{selectedEntity.portrait}</p>
                    </div>
                  )}

                  {selectedEntity.mentions.length > 0 && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Mentions</h3>
                      {selectedEntity.mentions.map(mention => (
                        <div key={mention.id} className="moment-card">
                          <p className="moment-quote">"{mention.quote}"</p>
                          <p className="moment-context">
                            From {mention.filename} • {new Date(mention.recording_date).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedEntity.connections.length > 0 && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Connections</h3>
                      {selectedEntity.connections.map(conn => (
                        <div key={conn.id} className="moment-card">
                          <p className="moment-quote">{conn.related_name}</p>
                          <p className="moment-context">{conn.relationship}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div className="chat-panel">
            <div className="chat-header">CloudKit AI</div>
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div className="empty-state">
                  <p>Ask me anything about your memories.</p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.role}`}>
                  {msg.content}
                </div>
              ))}
            </div>
            <div className="chat-input-container">
              <input
                type="text"
                className="chat-input"
                placeholder="Ask a question..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              />
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-header">
              <h2 className="settings-title">Settings</h2>
              <button className="icon-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="settings-content">
              <div className="settings-section">
                <h3 className="settings-section-title">API Keys</h3>
                <div className="settings-field">
                  <label className="settings-label">Deepgram API Key</label>
                  <input
                    type="password"
                    className="settings-input"
                    placeholder="Enter Deepgram API key"
                    value={settings.deepgram_api_key}
                    onChange={(e) => setSettings(s => ({ ...s, deepgram_api_key: e.target.value }))}
                  />
                </div>
                <div className="settings-field">
                  <label className="settings-label">Claude API Key</label>
                  <input
                    type="password"
                    className="settings-input"
                    placeholder="Enter Claude API key"
                    value={settings.claude_api_key}
                    onChange={(e) => setSettings(s => ({ ...s, claude_api_key: e.target.value }))}
                  />
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">Theme</h3>
                <div className="theme-options">
                  <div
                    className={`theme-option ${settings.theme === 'light' ? 'active' : ''}`}
                    onClick={() => setSettings(s => ({ ...s, theme: 'light' }))}
                  >
                    <div className="theme-preview light" />
                    Light
                  </div>
                  <div
                    className={`theme-option ${settings.theme === 'warm' ? 'active' : ''}`}
                    onClick={() => setSettings(s => ({ ...s, theme: 'warm' }))}
                  >
                    <div className="theme-preview warm" />
                    Warm
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">About</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  CloudKit v1.0.0<br />
                  Your data lives on your Cloudflare account.
                </p>
              </div>
            </div>
            <div className="settings-footer">
              <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveSettings}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="context-menu-item"
            onClick={() => triggerAction(contextMenu.recording.id, 'transcribe')}
          >
            🎙️ Transcribe
          </div>
          <div
            className="context-menu-item"
            onClick={() => triggerAction(contextMenu.recording.id, 'summarize')}
          >
            📝 Summarize
          </div>
          <div className="context-menu-separator" />
          <div
            className="context-menu-item danger"
            onClick={() => {
              deleteRecording(contextMenu.recording.id);
              setContextMenu(null);
            }}
          >
            🗑️ Delete
          </div>
        </div>
      )}
    </div>
  );
}
