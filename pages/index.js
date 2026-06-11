import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';

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

const GlyphLeaf = ({ size = 18 }) => (
  <Icon size={size}>
    <path d="M13.5 2.5C8 2.5 3.5 5.5 3.5 11c0 1.5.4 2.5.4 2.5S5 13 6.5 13c5.5 0 7-4.5 7-10.5z" />
    <path d="M3.9 13.5C6.5 10 9.5 7.5 12 6" />
  </Icon>
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

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [accessToken, setAccessToken] = useState('');
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
        body: JSON.stringify({ email: loginEmail }),
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
        <title>Second Brain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      {!authenticated ? (
        <main className="login-page">
          <div className="login-card">
            <div className="wordmark">
              <GlyphLeaf size={22} />
              <span>Second Brain</span>
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
                <GlyphLeaf />
                <span>Second Brain</span>
              </div>
              <button className="icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
                <GlyphClose />
              </button>
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

          {/* Main Chat Area */}
          <div className="chat-container">
            <header className="topbar">
              <span className="chat-title">{currentChat?.title || 'New chat'}</span>
              <span className="session">{email}</span>
            </header>

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
                    {msg.role === 'assistant' && <div className="speaker">Second Brain</div>}
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
                {loading && (
                  <div className="message assistant">
                    <div className="speaker">Second Brain</div>
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
        html, body, #__next { height: 100%; }
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

      <style jsx>{`
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
          gap: 0.5rem;
          color: var(--accent);
          font-weight: 600;
          font-size: 0.9rem;
          letter-spacing: 0.01em;
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
        .chat-page { height: 100%; display: flex; }

        .sidebar {
          width: 264px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          padding: 1.1rem 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 1.4rem;
          overflow-y: auto;
          transition: transform 0.2s ease;
        }
        .sidebar.closed { display: none; }

        .sidebar-header {
          display: flex;
          justify-content: space-between;
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
          margin-top: auto;
          padding-top: 0.9rem;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 2px;
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
          display: flex;
          flex-direction: column;
        }

        .topbar {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.9rem 1.75rem;
          border-bottom: 1px solid var(--border);
        }
        .chat-title {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--fg-strong);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .session { font-size: 0.78rem; color: var(--muted); white-space: nowrap; }

        .messages { flex: 1; overflow-y: auto; }
        .messages-inner {
          max-width: 720px;
          margin: 0 auto;
          padding: 2rem 1.5rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 1.6rem;
        }

        .empty-state { margin-top: 18vh; }
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
        .composer { padding: 0.75rem 1.5rem 1.4rem; }
        .input-shell {
          max-width: 720px;
          margin: 0 auto;
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

        /* ----------------------------------------------------------- mobile */
        @media (max-width: 768px) {
          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            height: 100vh;
            width: 272px;
            z-index: 1000;
            background: var(--bg);
            box-shadow: var(--shadow-deep);
          }
          .sidebar.closed { display: none; }
          .topbar { padding: 0.9rem 1rem 0.9rem 3.4rem; }
          .messages-inner { padding: 1.25rem 1rem; }
          .message.user .message-content { max-width: 88%; }
          .composer { padding: 0.6rem 1rem 1rem; }
          .graph-modal { width: 95%; height: 70vh; }
        }
      `}</style>
    </>
  );
}
