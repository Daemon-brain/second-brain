import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import Cropper from 'react-easy-crop';

const ForceGraph2D = dynamic(() => import('react-force-graph').then((mod) => mod.ForceGraph2D), {
  ssr: false,
  loading: () => <div className="graph-loading">Rendering graph…</div>,
});

/* ----------------------------------------------------------------------------
 * Icon system - handcrafted 16px glyphs, 1.5px stroke, round joins.
 * One family, one weight. No emojis.
 * ------------------------------------------------------------------------- */
const Icon = ({ children, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/* Filled brain mark, side profile facing left: cerebrum, cerebellum and
   brain stem in currentColor, sulci carved with the page background so it
   adapts to light/dark themes. */
const GlyphBrain = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <g fill="currentColor">
      {/* cerebrum */}
      <circle cx="6.8" cy="6.8" r="2.5" />
      <circle cx="11.5" cy="4.9" r="2.6" />
      <circle cx="16" cy="6" r="2.4" />
      <circle cx="19" cy="9" r="2.4" />
      <circle cx="4.4" cy="10.2" r="2.3" />
      <circle cx="5.6" cy="13.2" r="2.2" />
      <circle cx="9" cy="14.6" r="2.2" />
      <circle cx="11.5" cy="9.5" r="4.5" />
      <circle cx="12.8" cy="12.5" r="3" />
      <circle cx="18.6" cy="12.2" r="2" />
      {/* cerebellum */}
      <circle cx="17.2" cy="15.6" r="2.3" />
      <circle cx="14.6" cy="16.2" r="1.6" />
      {/* brain stem */}
      <path d="M10.8 15l2.9.2-.4 3.2a1.3 1.3 0 0 1-2.6-.2z" />
    </g>
    <g style={{ stroke: 'var(--bg)' }} strokeWidth="1.3" strokeLinecap="round" fill="none">
      <path d="M6.2 8.2c.9-.6 2-.4 2.6.4" />
      <path d="M11 6.4c.8.7.9 1.8.2 2.6" />
      <path d="M16.6 8.4c-.9-.3-1.9.1-2.3 1" />
      <path d="M7.4 12.2c.8-.7 2-.7 2.7 0" />
      <path d="M12.6 11.2c.9.3 1.4 1.2 1.2 2.1" />
      <path d="M14.9 14.2l4.2 1" />
    </g>
  </svg>
);
const GlyphPlus = () => (
  <Icon>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
);
const GlyphIndex = () => (
  <Icon>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h5" />
    <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
  </Icon>
);
const GlyphSearch = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.5 10.5L14 14" />
  </Icon>
);
const GlyphCompose = () => (
  <Icon>
    <path d="M11.3 2.7a1.4 1.4 0 012 2L6.5 11.5l-3 1 1-3z" />
    <path d="M9.5 4.5l2 2" />
  </Icon>
);
const GlyphGraph = () => (
  <Icon>
    <circle cx="4" cy="4" r="1.75" />
    <circle cx="12" cy="5.5" r="1.75" />
    <circle cx="7.5" cy="12" r="1.75" />
    <path d="M5.7 4.4l4.6.85M5 10.5l-.4-4.7M9 11l2.3-3.9" />
  </Icon>
);
const GlyphFolder = () => (
  <Icon>
    <path d="M2 4.5A1.5 1.5 0 013.5 3h2.6l1.4 1.8h5A1.5 1.5 0 0114 6.3v5.2a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z" />
  </Icon>
);
const GlyphTrash = () => (
  <Icon>
    <path d="M3 4.5h10M6.5 2.5h3M5 4.5l.5 8.5a1 1 0 001 1h3a1 1 0 001-1l.5-8.5" />
  </Icon>
);
const GlyphMoon = () => (
  <Icon>
    <path d="M13 9.5A5.5 5.5 0 016.5 3 5.5 5.5 0 1013 9.5z" />
  </Icon>
);
const GlyphSun = () => (
  <Icon>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
  </Icon>
);
const GlyphExit = () => (
  <Icon>
    <path d="M6.5 2.5H3.5v11h3" />
    <path d="M10 5l3 3-3 3M13 8H6.5" />
  </Icon>
);
const GlyphClose = () => (
  <Icon>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
const GlyphMenu = () => (
  <Icon>
    <path d="M2.5 5.5h11M2.5 10.5h11" />
  </Icon>
);
const GlyphSend = () => (
  <Icon>
    <path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7" />
  </Icon>
);

/* Cover Header Component */
function CoverHeader({ cover, onEdit }) {
  if (!cover) {
    return null;
  }

  const imageUrl = typeof cover === 'string' ? cover : cover.url || cover;
  const crop = cover.crop || { x: 0, y: 0, width: 1, height: 1 };

  return (
    <div className="cover-header">
      <img
        src={imageUrl}
        alt="Cover"
        className="cover-image"
        style={{
          objectPosition: `${crop.x * 100}% ${crop.y * 100}%`,
          objectFit: 'cover',
        }}
      />
      <div className="cover-actions">
        <button onClick={onEdit} className="cover-action-btn" title="Edit cover">
          ✎
        </button>
        <button
          onClick={() => onEdit(true)}
          className="cover-action-btn"
          title="Replace cover"
        >
          ⟳
        </button>
      </div>
    </div>
  );
}

/* Cover Modal Component */
function CoverModal({ isOpen, onClose, onSave, currentCover }) {
  const [mode, setMode] = useState('source'); // 'source', 'crop'
  const [imageSource, setImageSource] = useState('');
  const [imageSrc, setImageSrc] = useState(currentCover || '');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      setImageSrc(dataUrl);
      setMode('crop');
    };
    reader.readAsDataURL(file);
  };

  const handleUrlImport = () => {
    if (!imageSource.trim()) return;
    setImageSrc(imageSource);
    setImageSource('');
    setMode('crop');
  };

  const handleCropComplete = (croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleSave = () => {
    if (mode === 'crop') {
      const cropData = {
        url: imageSrc,
        crop: croppedAreaPixels
          ? {
              x: croppedAreaPixels.x / croppedAreaPixels.width,
              y: croppedAreaPixels.y / croppedAreaPixels.height,
              width: croppedAreaPixels.width,
              height: croppedAreaPixels.height,
            }
          : { x: 0, y: 0, width: 1, height: 1 },
      };
      onSave(cropData);
      resetForm();
      onClose();
    }
  };

  const handleRemove = () => {
    onSave(null);
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setMode('source');
    setImageSource('');
    setImageSrc('');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  if (!isOpen) return null;

  return (
    <div className="cover-modal-overlay" onClick={onClose}>
      <div className="cover-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cover-modal-header">
          <h2>Edit Cover</h2>
          <button onClick={onClose} className="modal-close-btn">✕</button>
        </div>

        {mode === 'source' ? (
          <div className="cover-modal-content">
            <div className="cover-source-section">
              <h3>Upload Image</h3>
              <label className="file-input-label">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileUpload}
                  className="file-input"
                />
                Click to upload or drag an image
              </label>
            </div>

            <div className="cover-source-divider" />

            <div className="cover-source-section">
              <h3>Import from URL</h3>
              <div className="url-section">
                <input
                  type="url"
                  value={imageSource}
                  onChange={(e) => setImageSource(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="url-input"
                />
                <button
                  onClick={handleUrlImport}
                  disabled={!imageSource.trim()}
                  className="import-btn"
                >
                  Import
                </button>
              </div>
            </div>

            {currentCover && (
              <div className="cover-source-section">
                <button onClick={handleRemove} className="remove-btn">
                  Remove Cover
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="cover-modal-content">
            <div className="cropper-container">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={16 / 9}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={handleCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="cropper-controls">
              <div className="zoom-control">
                <label>Zoom</label>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="zoom-slider"
                />
              </div>
            </div>
          </div>
        )}

        <div className="cover-modal-footer">
          {mode === 'crop' && (
            <button onClick={() => setMode('source')} className="modal-btn modal-btn-secondary">
              Change Source
            </button>
          )}
          <button onClick={onClose} className="modal-btn modal-btn-secondary">
            Cancel
          </button>
          {mode === 'crop' && (
            <button onClick={handleSave} className="modal-btn modal-btn-primary">
              Save Cover
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Chat & sidebar state
  const [chats, setChats] = useState([]); // array of { id, title, messages }
  const [currentChatId, setCurrentChatId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState('light');
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const [coverModalOpen, setCoverModalOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Get current chat
  const currentChat = chats.find((c) => c.id === currentChatId);
  const messages = currentChat?.messages || [];

  // Restore session & chats on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const savedEmail = localStorage.getItem('email');
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (token && savedEmail) {
      setAccessToken(token);
      setEmail(savedEmail);
      setAuthenticated(true);

      const savedChats = JSON.parse(localStorage.getItem('chats') || '[]');
      setChats(savedChats.length > 0 ? savedChats : []);
      if (savedChats.length > 0) {
        setCurrentChatId(savedChats[0].id);
      } else {
        createNewChat();
      }
    } else if (savedEmail) {
      fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.accessToken) {
            localStorage.setItem('accessToken', data.accessToken);
            setAccessToken(data.accessToken);
            setEmail(savedEmail);
            setAuthenticated(true);
            const savedChats = JSON.parse(localStorage.getItem('chats') || '[]');
            setChats(savedChats.length > 0 ? savedChats : []);
            if (savedChats.length > 0) {
              setCurrentChatId(savedChats[0].id);
            } else {
              createNewChat();
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Persist chats to localStorage
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem('chats', JSON.stringify(chats));
    }
  }, [chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const createNewChat = useCallback(() => {
    const newChat = {
      id: Date.now().toString(),
      title: 'New chat',
      messages: [],
      cover: null, // { url, crop: { x, y, width, height } } or base64 data URL
    };
    setChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setInput('');
  }, []);

  const deleteChat = useCallback((chatId) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (currentChatId === chatId) {
      const remaining = chats.filter((c) => c.id !== chatId);
      if (remaining.length > 0) {
        setCurrentChatId(remaining[0].id);
      } else {
        createNewChat();
      }
    }
  }, [currentChatId, chats, createNewChat]);

  const updateCover = useCallback((coverData) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === currentChatId ? { ...chat, cover: coverData } : chat
      )
    );
  }, [currentChatId]);

  const updateChatMessages = useCallback((newMessages) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === currentChatId
          ? { ...c, messages: newMessages, title: newMessages[0]?.content?.slice(0, 34) || 'New chat' }
          : c
      )
    );
  }, [currentChatId]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('email');
    localStorage.removeItem('chats');
    setAccessToken('');
    setChats([]);
    setCurrentChatId(null);
    setAuthenticated(false);
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }, [theme]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    const loginEmail = email.toLowerCase();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail, accessKey: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.error || 'Invalid credentials');
        setTimeout(() => setLoginError(''), 5000);
        return;
      }
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('email', loginEmail);
      setAccessToken(data.accessToken);
      setEmail(loginEmail);
      setAuthenticated(true);
      createNewChat();
    } catch {
      setLoginError('Error. Please check your connection.');
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || !currentChat) return;

    const nextMessages = [...messages, { role: 'user', content: text }];
    updateChatMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (res.status === 401 || res.status === 403) {
        handleLogout();
        alert('Session expired. Please login again.');
        return;
      }

      const data = await res.json().catch(() => ({}));
      const reply = res.ok ? data.response : data.error || 'Error communicating with vault.';
      updateChatMessages([...nextMessages, { role: 'assistant', content: reply }]);
    } catch {
      updateChatMessages([...nextMessages, { role: 'assistant', content: 'Error. Please check your connection.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function fillInput(text) {
    setInput(text);
    inputRef.current?.focus();
  }

  async function loadGraph() {
    setGraphLoading(true);
    try {
      const res = await fetch('/api/graph', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setGraphData(data || { nodes: [], links: [] });
      setGraphOpen(true);
    } catch {
      alert('Failed to load graph');
    } finally {
      setGraphLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Daemon</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      {!authenticated ? (
        <main className="login-page">
          <div className="login-card">
            <div className="wordmark">
              <GlyphBrain size={22} />
              <span>Daemon</span>
            </div>
            <h1>Your knowledge,<br />one question away.</h1>
            <form onSubmit={handleLogin}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                autoFocus
                maxLength={254}
                aria-label="Email address"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                maxLength={128}
                aria-label="Password"
              />
              <button type="submit">Continue</button>
            </form>
            {loginError && <p className="error" role="alert">{loginError}</p>}
          </div>
        </main>
      ) : (
        <main className="chat-page">
          {/* Sidebar */}
          <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header">
              <div className="wordmark">
                <GlyphBrain size={26} />
                <span>Daemon</span>
              </div>
            </div>

            <button className="new-chat-btn" onClick={createNewChat}>
              <GlyphPlus />
              <span>New chat</span>
            </button>

            <nav className="section">
              <h3>Vault</h3>
              <button onClick={() => fillInput('List all my notes')} className="nav-row">
                <GlyphIndex />
                <span>Index of notes</span>
              </button>
              <button onClick={() => fillInput('Search for: ')} className="nav-row">
                <GlyphSearch />
                <span>Search</span>
              </button>
              <button onClick={() => fillInput('Create a note about: ')} className="nav-row">
                <GlyphCompose />
                <span>New note</span>
              </button>
              <button onClick={loadGraph} className="nav-row" disabled={graphLoading}>
                <GlyphGraph />
                <span>{graphLoading ? 'Loading graph…' : 'Graph'}</span>
              </button>
            </nav>

            <nav className="section">
              <h3>Folders</h3>
              <button onClick={() => fillInput('Show all notes in notes/')} className="nav-row">
                <GlyphFolder />
                <span>notes</span>
              </button>
              <button onClick={() => fillInput('Show all notes in learning/')} className="nav-row">
                <GlyphFolder />
                <span>learning</span>
              </button>
              <button onClick={() => fillInput('Show all notes in projects/')} className="nav-row">
                <GlyphFolder />
                <span>projects</span>
              </button>
            </nav>

            <nav className="section history">
              <h3>History</h3>
              <div className="chats-list">
                {chats.map((chat) => (
                  <div key={chat.id} className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}>
                    <button className="chat-btn" onClick={() => setCurrentChatId(chat.id)} title={chat.title}>
                      {chat.title}
                    </button>
                    <button className="icon-btn ghost" onClick={() => deleteChat(chat.id)} aria-label="Delete chat">
                      <GlyphTrash />
                    </button>
                  </div>
                ))}
              </div>
            </nav>

            <div className="sidebar-footer">
              <button onClick={toggleTheme} className="nav-row">
                {theme === 'light' ? <GlyphMoon /> : <GlyphSun />}
                <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
              </button>
              <button onClick={handleLogout} className="nav-row signout">
                <GlyphExit />
                <span>Sign out</span>
              </button>
            </div>
          </aside>

          {/* Sidebar Toggle */}
          {!sidebarOpen && (
            <button className="sidebar-toggle icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <GlyphMenu />
            </button>
          )}

          {/* Main column: static header on top, scrollable chat below */}
          <div className="main-column">
          <div className="page-header">
            <div className="page-header-inner">
              <button onClick={() => setCoverModalOpen(true)} className="add-cover-btn">
                <span>+ Add cover</span>
              </button>
            </div>
          </div>

          <div className="chat-container">
            <CoverHeader cover={currentChat?.cover} onEdit={() => setCoverModalOpen(true)} />

            <div className="messages">
              <div className="messages-inner">
                {messages.length === 0 && !loading && (
                  <div className="empty-state">
                    <h2>What do you want to know?</h2>
                    <p>Everything you&rsquo;ve saved is a question away.</p>
                    <div className="suggestions">
                      <button onClick={() => fillInput('List all my notes')}>List all my notes</button>
                      <button onClick={() => fillInput('Find notes about ')}>Find notes about a topic</button>
                      <button onClick={() => fillInput('Create a note about ')}>Create a new note</button>
                    </div>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div key={idx} className={`message ${msg.role}`}>
                    {msg.role === 'assistant' && <div className="speaker">Daemon</div>}
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
                {loading && (
                  <div className="message assistant">
                    <div className="speaker">Daemon</div>
                    <div className="pulse" aria-label="Thinking">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="composer">
              <form onSubmit={handleSendMessage} className="input-shell">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask your vault"
                  disabled={loading}
                  maxLength={8000}
                  aria-label="Message"
                />
                <button type="submit" className="send-btn" disabled={loading || !input.trim()} aria-label="Send">
                  <GlyphSend />
                </button>
              </form>
            </div>
          </div>
          </div>

          {/* Graph Modal */}
          {graphOpen && (
            <div className="graph-modal-overlay" onClick={() => setGraphOpen(false)}>
              <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
                <div className="graph-header">
                  <h2>Vault graph</h2>
                  <button className="icon-btn" onClick={() => setGraphOpen(false)} aria-label="Close graph">
                    <GlyphClose />
                  </button>
                </div>
                <div className="graph-container">
                  {graphData.nodes.length > 0 ? (
                    <ForceGraph2D
                      graphData={graphData}
                      nodeLabel={(node) => node.name}
                      nodeColor={() => '#1B8A6F'}
                      linkColor={() => 'rgba(74, 155, 111, 0.4)'}
                      width={800}
                      height={600}
                      onNodeClick={(node) => {
                        fillInput(`Search for: ${node.name}`);
                        setGraphOpen(false);
                      }}
                    />
                  ) : (
                    <div className="graph-empty">No notes yet. Connections appear as your vault grows.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Cover Modal */}
          <CoverModal
            isOpen={coverModalOpen}
            onClose={() => setCoverModalOpen(false)}
            onSave={updateCover}
            currentCover={currentChat?.cover}
          />
        </main>
      )}

      <style jsx global>{`
        /* JUNGLE GREEN palette - see JUNGLE_GREEN_VISUAL_STYLE_GUIDE.md */
        :root[data-theme='light'] {
          --bg: #F5F3F0;
          --bg-secondary: #EFECE6;
          --fg: #2D1F1A;
          --fg-strong: #1A1A1A;
          --border: rgba(74, 155, 111, 0.25);
          --border-strong: #4A9B6F;
          --accent: #1B8A6F;
          --accent-dark: #0B5F4C;
          --accent-tint: rgba(27, 138, 111, 0.08);
          --gold: #D4A574;
          --danger: #B85C3C;
          --muted: #7BA888;
          --cream: #F5F3F0;
          --shadow-light: 0 1px 3px rgba(11, 95, 76, 0.08);
          --shadow-medium: 0 4px 12px rgba(11, 95, 76, 0.15);
          --shadow-deep: 0 8px 24px rgba(11, 95, 76, 0.25);
        }
        :root[data-theme='dark'] {
          --bg: #15201B;
          --bg-secondary: #1C2A23;
          --fg: #E8E4DC;
          --fg-strong: #F5F3F0;
          --border: rgba(74, 155, 111, 0.25);
          --border-strong: #4A9B6F;
          --accent: #1B8A6F;
          --accent-dark: #23A585;
          --accent-tint: rgba(27, 138, 111, 0.14);
          --gold: #D4A574;
          --danger: #C96B4A;
          --muted: #7BA888;
          --cream: #F5F3F0;
          --shadow-light: 0 1px 3px rgba(0, 0, 0, 0.25);
          --shadow-medium: 0 4px 12px rgba(0, 0, 0, 0.35);
          --shadow-deep: 0 8px 24px rgba(0, 0, 0, 0.45);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        /* The app is viewport-locked: only .messages scrolls internally,
           so the sidebar, header and composer always stay in view. */
        html, body, #__next { height: 100%; overflow: hidden; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
          font-size: 0.95rem;
          line-height: 1.6;
          letter-spacing: -0.2px;
          color: var(--fg);
          background: var(--bg);
        }
        h1, h2 {
          font-family: Georgia, 'Crimson Text', serif;
          letter-spacing: -0.5px;
          line-height: 1.2;
          color: var(--fg-strong);
          font-weight: 600;
        }
        button {
          cursor: pointer;
          border: none;
          background: none;
          border-radius: 6px;
          font-weight: 500;
          font-family: inherit;
          font-size: inherit;
          color: inherit;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease,
            box-shadow 0.15s ease, opacity 0.15s ease;
        }
        button:disabled { cursor: not-allowed; opacity: 0.55; }
        input {
          border: 1px solid var(--border-strong);
          border-radius: 6px;
          font-size: 16px;
          font-family: inherit;
          padding: 0.7rem 1rem;
          background: var(--bg);
          color: var(--fg);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        input::placeholder { color: var(--muted); }
        input:focus {
          outline: none;
          border-color: var(--gold);
          box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.12);
        }

        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
      `}</style>

      <style jsx global>{`
        /* ------------------------------------------------------------ login */
        .login-page {
          height: 100%;
          display: grid;
          place-items: center;
          padding: 1.5rem;
        }
        .login-card {
          width: 100%;
          max-width: 360px;
        }
        .wordmark {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          color: var(--accent);
          font-weight: 700;
          font-size: 1.55rem;
          letter-spacing: 0.02em;
        }
        .wordmark span { color: var(--fg-strong); }
        .login-card h1 {
          font-size: 1.9rem;
          margin: 1.25rem 0 2rem;
        }
        .login-card form {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .login-card button {
          background: var(--accent);
          color: var(--cream);
          padding: 0.7rem;
          font-size: 0.95rem;
        }
        .login-card button:hover:not(:disabled) {
          background: var(--accent-dark);
          box-shadow: var(--shadow-medium);
        }
        .error { color: var(--danger); margin-top: 1rem; font-size: 0.88rem; }

        /* ----------------------------------------------------------- layout */
        /* Viewport-locked app frame: sidebar | main-column. The frame never
           scrolls; only .messages scrolls inside the main column. */
        .chat-page {
          height: 100%;
          display: flex;
          overflow: hidden;
        }
        .main-column {
          flex: 1;
          min-width: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .sidebar {
          width: 264px;
          flex-shrink: 0;
          height: 100%;
          border-right: 1px solid var(--border);
          padding: 1.1rem 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 1.4rem;
          overflow-y: auto;
          z-index: 400;
          background: var(--bg);
        }
        .sidebar.closed { display: none; }

        .sidebar-header {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 0 0.4rem;
        }

        .icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          color: var(--muted);
          flex-shrink: 0;
        }
        .icon-btn:hover { color: var(--fg-strong); background: var(--accent-tint); }

        .new-chat-btn {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.55rem 0.75rem;
          border: 1px solid var(--border);
          color: var(--fg-strong);
          font-size: 0.9rem;
        }
        .new-chat-btn:hover {
          border-color: var(--border-strong);
          background: var(--accent-tint);
        }

        .section { display: flex; flex-direction: column; gap: 2px; }
        .section h3 {
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--muted);
          padding: 0 0.75rem;
          margin-bottom: 0.35rem;
        }

        .nav-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.45rem 0.75rem;
          font-size: 0.9rem;
          font-weight: 400;
          color: var(--fg);
          text-align: left;
          width: 100%;
        }
        .nav-row :global(svg) { color: var(--muted); flex-shrink: 0; }
        .nav-row:hover { background: var(--accent-tint); color: var(--fg-strong); }
        .nav-row:hover :global(svg) { color: var(--accent); }

        .history { min-height: 0; }
        .chats-list {
          display: flex;
          flex-direction: column;
          gap: 1px;
          overflow-y: auto;
          max-height: 280px;
        }
        .chat-item {
          display: flex;
          align-items: center;
          border-radius: 6px;
        }
        .chat-item .icon-btn.ghost { opacity: 0; }
        .chat-item:hover .icon-btn.ghost { opacity: 1; }
        .icon-btn.ghost:hover { color: var(--danger); background: none; }
        .chat-btn {
          flex: 1;
          min-width: 0;
          padding: 0.45rem 0.75rem;
          font-size: 0.88rem;
          font-weight: 400;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--fg);
        }
        .chat-item:hover { background: var(--accent-tint); }
        .chat-item.active { background: var(--accent-tint); }
        .chat-item.active .chat-btn { color: var(--accent-dark); font-weight: 500; }

        .sidebar-footer {
          margin-top: 7.5rem;
          padding: 0.9rem 0 1.5rem;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex-shrink: 0;
        }
        .signout:hover { color: var(--danger); }
        .signout:hover :global(svg) { color: var(--danger); }

        .sidebar-toggle {
          position: fixed;
          top: 0.9rem;
          left: 0.9rem;
          z-index: 1100;
          background: var(--bg);
          border: 1px solid var(--border);
          box-shadow: var(--shadow-light);
        }

        /* ------------------------------------------------------------- chat */
        .chat-container {
          flex: 1;
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }

        .messages { flex: 1; min-height: 0; overflow-y: auto; }
        /* Shared chat column: .messages-inner and .composer must keep
           identical width, max-width, and side padding so messages and
           the input bar align on the same left edge. */
        .messages-inner {
          width: 100%;
          max-width: 1080px;
          margin: 0 auto;
          padding: 2rem 1.5rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 1.6rem;
        }

        .empty-state { margin-top: 0; }
        .empty-state h2 { font-size: 1.6rem; }
        .empty-state p { color: var(--muted); margin-top: 0.4rem; }
        .suggestions {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          margin-top: 1.6rem;
        }
        .suggestions button {
          padding: 0.45rem 0.7rem;
          margin-left: -0.7rem;
          font-weight: 400;
          color: var(--accent-dark);
        }
        .suggestions button:hover { background: var(--accent-tint); }

        .message.user { display: flex; justify-content: flex-end; }
        .message.user .message-content {
          background: var(--accent);
          color: var(--cream);
          padding: 0.55rem 0.95rem;
          border-radius: 10px;
          max-width: 75%;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .message.assistant .message-content {
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--fg);
        }
        .speaker {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 0.3rem;
        }

        .pulse { display: flex; gap: 5px; padding: 0.3rem 0; }
        .pulse span {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--muted);
          animation: breathe 1.2s ease-in-out infinite;
        }
        .pulse span:nth-child(2) { animation-delay: 0.18s; }
        .pulse span:nth-child(3) { animation-delay: 0.36s; }
        @keyframes breathe {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }

        /* --------------------------------------------------------- composer */
        .composer {
          width: 100%;
          max-width: 1080px;
          margin: 0 auto;
          padding: 0.75rem 1.5rem 1.4rem;
          flex-shrink: 0;
        }
        .input-shell {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          border: 1px solid var(--border-strong);
          border-radius: 10px;
          padding: 0.3rem 0.3rem 0.3rem 0.4rem;
          background: var(--bg);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .input-shell:focus-within {
          border-color: var(--gold);
          box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.12);
        }
        .input-shell input {
          flex: 1;
          border: none;
          background: none;
          padding: 0.45rem 0.6rem;
        }
        .input-shell input:focus { box-shadow: none; }
        .send-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: var(--accent);
          color: var(--cream);
          flex-shrink: 0;
        }
        .send-btn:hover:not(:disabled) { background: var(--accent-dark); }

        /* ------------------------------------------------------------ graph */
        .graph-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(26, 26, 26, 0.45);
          display: grid;
          place-items: center;
          z-index: 2000;
        }
        .graph-modal {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          width: 90%;
          max-width: 900px;
          height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-deep);
        }
        .graph-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.1rem 1.4rem;
          border-bottom: 1px solid var(--border);
        }
        .graph-header h2 { font-size: 1.15rem; }
        .graph-container {
          flex: 1;
          overflow: hidden;
          display: grid;
          place-items: center;
        }
        .graph-empty { color: var(--muted); padding: 2rem; text-align: center; }
        :global(.graph-loading) { color: var(--muted); }

        /* ----------------------------------------------------------- header */
        .page-header {
          position: sticky;
          top: 0;
          height: 60px;
          flex-shrink: 0;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          z-index: 500;
        }
        /* Same column metrics as .composer so the button's right edge
           lines up with the input bar's right edge. */
        .page-header-inner {
          width: 100%;
          max-width: 1080px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          justify-content: flex-end;
        }

        .header-brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-weight: 600;
          font-size: 1rem;
          color: var(--fg-strong);
          letter-spacing: 0.02em;
        }
        .header-brand :global(svg) {
          color: var(--accent);
        }

        .add-cover-btn {
          padding: 0.65rem 1.25rem;
          background: var(--bg-secondary);
          color: var(--fg);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s ease;
          letter-spacing: 0.02em;
        }
        .add-cover-btn:hover {
          background: var(--border);
          border-color: var(--border-strong);
          color: var(--accent);
        }

        /* ----------------------------------------------------------- cover */

        .cover-placeholder {
          width: 100%;
          height: 240px;
          background: linear-gradient(135deg, var(--border) 0%, var(--border-strong) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .cover-add-btn {
          background: rgba(255, 255, 255, 0.15);
          color: var(--muted);
          border: 1px solid var(--border-strong);
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .cover-add-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          color: var(--fg);
        }

        .cover-header {
          width: 100%;
          height: 240px;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-secondary);
        }
        .cover-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .cover-actions {
          position: absolute;
          top: 1rem;
          right: 1rem;
          display: flex;
          gap: 0.5rem;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .cover-header:hover .cover-actions {
          opacity: 1;
        }
        .cover-action-btn {
          background: rgba(0, 0, 0, 0.4);
          color: white;
          border: none;
          width: 36px;
          height: 36px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1.1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s ease;
        }
        .cover-action-btn:hover {
          background: rgba(0, 0, 0, 0.6);
        }

        /* Cover popup: anchored under the "+ Add cover" button in the header */
        .cover-modal-overlay {
          position: fixed;
          inset: 0;
          background: transparent;
          z-index: 2000;
        }
        .cover-modal {
          position: fixed;
          top: 68px;
          /* Align right edge with the header button / input bar column */
          right: calc(max(0px, (100vw - 264px - 1080px) / 2) + 1.5rem);
          width: 440px;
          max-width: calc(100vw - 264px - 3rem);
          max-height: calc(100vh - 84px);
          overflow-y: auto;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
          display: flex;
          flex-direction: column;
          transform-origin: top right;
          animation: cover-pop 0.16s ease;
        }
        @keyframes cover-pop {
          from { opacity: 0; transform: scale(0.96) translateY(-6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .cover-modal-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }
        .cover-modal-header h2 {
          margin: 0;
          font-size: 1.05rem;
          color: var(--fg);
        }
        .modal-close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: var(--muted);
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-close-btn:hover {
          color: var(--fg);
        }

        .cover-modal-content {
          padding: 1.25rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .cover-source-section {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .cover-source-section h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--fg);
          letter-spacing: 0.02em;
        }

        .file-input {
          display: none;
        }
        .file-input-wrapper {
          display: inline-block;
        }
        .file-input-label {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem 1.25rem;
          border: 2px dashed var(--border-strong);
          border-radius: 10px;
          background: linear-gradient(135deg, var(--bg-secondary) 0%, rgba(27, 138, 111, 0.02) 100%);
          cursor: pointer;
          font-weight: 500;
          color: var(--fg);
          transition: all 0.25s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .file-input-label:hover {
          border-color: var(--accent);
          background: linear-gradient(135deg, rgba(27, 138, 111, 0.05) 0%, rgba(27, 138, 111, 0.02) 100%);
          color: var(--accent);
        }

        .url-section {
          display: flex;
          gap: 0.75rem;
          align-items: flex-end;
        }
        .url-input {
          flex: 1;
          padding: 0.85rem 1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 0.95rem;
          background: var(--bg-secondary);
          color: var(--fg);
          font-family: inherit;
          transition: all 0.2s ease;
        }
        .url-input::placeholder {
          color: var(--muted);
        }
        .url-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(27, 138, 111, 0.1);
        }

        .import-btn {
          padding: 0.85rem 1.75rem;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }
        .import-btn:hover:not(:disabled) {
          background: #157056;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(27, 138, 111, 0.3);
        }
        .import-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .cover-source-divider {
          text-align: center;
          color: var(--muted);
          font-size: 0.95rem;
          font-weight: 500;
          position: relative;
          margin: 0.5rem 0;
        }
        .cover-source-divider::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          width: 100%;
          height: 1px;
          background: var(--border);
          z-index: -1;
        }
        .cover-source-divider::after {
          content: 'or';
          position: relative;
          background: var(--bg);
          padding: 0 1rem;
        }

        .remove-btn {
          padding: 0.85rem 1.5rem;
          background: rgba(220, 74, 56, 0.08);
          color: var(--danger);
          border: 1px solid rgba(220, 74, 56, 0.3);
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          letter-spacing: 0.02em;
        }
        .remove-btn:hover {
          background: rgba(220, 74, 56, 0.15);
          border-color: var(--danger);
        }

        .cropper-container {
          position: relative;
          width: 100%;
          height: 260px;
          background: var(--bg-secondary);
          border-radius: 8px;
          overflow: hidden;
        }
        :global(.reactEasyCrop_Container) {
          background: var(--bg-secondary) !important;
        }
        :global(.reactEasyCrop_Image) {
          max-width: none;
        }

        .cropper-controls {
          padding: 1rem 1.25rem;
          border-top: 1px solid var(--border);
          background: var(--bg-secondary);
        }
        .zoom-control {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .zoom-control label {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--fg);
          min-width: 50px;
          letter-spacing: 0.02em;
        }
        .zoom-slider {
          flex: 1;
          height: 6px;
          cursor: pointer;
          -webkit-appearance: none;
          appearance: none;
          background: var(--border);
          border-radius: 4px;
          border: none;
        }
        .zoom-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(27, 138, 111, 0.3);
          transition: all 0.2s ease;
        }
        .zoom-slider::-webkit-slider-thumb:hover {
          background: #157056;
          box-shadow: 0 2px 8px rgba(27, 138, 111, 0.4);
        }
        .zoom-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(27, 138, 111, 0.3);
          transition: all 0.2s ease;
        }
        .zoom-slider::-moz-range-thumb:hover {
          background: #157056;
          box-shadow: 0 2px 8px rgba(27, 138, 111, 0.4);
        }

        .cover-modal-footer {
          padding: 1rem 1.25rem;
          border-top: 1px solid var(--border);
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          flex-shrink: 0;
        }
        .modal-btn {
          padding: 0.6rem 1.25rem;
          border-radius: 8px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.95rem;
          letter-spacing: 0.02em;
        }
        .modal-btn-primary {
          background: var(--accent);
          color: white;
        }
        .modal-btn-primary:hover {
          background: #157056;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(27, 138, 111, 0.3);
        }
        .modal-btn-secondary {
          background: var(--bg-secondary);
          color: var(--fg);
          border: 1px solid var(--border);
        }
        .modal-btn-secondary:hover {
          background: var(--border);
          border-color: var(--border-strong);
        }

        /* ----------------------------------------------------------- mobile */
        @media (max-width: 768px) {
          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            height: 100vh;
            width: 272px;
            z-index: 1000;
            box-shadow: var(--shadow-deep);
          }
          .sidebar.closed { display: none; }
          .messages-inner { padding: 1.25rem 1rem; }
          .message.user .message-content { max-width: 88%; }
          .composer { padding: 0.6rem 1rem 1rem; }
          .graph-modal { width: 95%; height: 70vh; }
          .cover-header { height: 160px; }
          .cover-placeholder { height: 160px; }
          .cropper-container { height: 220px; }
          .cover-modal {
            left: 1rem;
            right: 1rem;
            width: auto;
            max-width: none;
          }
        }
      `}</style>
    </>
  );
}
