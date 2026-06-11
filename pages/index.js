import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';

const ForceGraph2D = dynamic(() => import('react-force-graph').then((mod) => mod.ForceGraph2D), {
  ssr: false,
  loading: () => <div className="graph-loading">Loading graph…</div>,
});

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

      // Load chat history
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
          ? { ...c, messages: newMessages, title: newMessages[0]?.content?.slice(0, 30) + '…' || 'New chat' }
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
            <h1>Second Brain</h1>
            <p className="subtitle">Secure personal knowledge vault</p>
            <form onSubmit={handleLogin}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoFocus
                maxLength={254}
                aria-label="Email address"
              />
              <button type="submit">Login</button>
            </form>
            {loginError && <p className="error" role="alert">{loginError}</p>}
          </div>
        </main>
      ) : (
        <main className="chat-page">
          {/* Sidebar */}
          <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header">
              <h2>Second Brain</h2>
              <button className="close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">✕</button>
            </div>

            <button className="new-chat-btn" onClick={createNewChat}>+ New Chat</button>

            {/* Quick Commands */}
            <div className="quick-commands">
              <h3>Quick Commands</h3>
              <button onClick={() => fillInput('List all my notes')} className="cmd-btn">📋 List all notes</button>
              <button onClick={() => fillInput('Search for: ')} className="cmd-btn">🔍 Search vault</button>
              <button onClick={() => fillInput('Create a note about: ')} className="cmd-btn">✏️ Create note</button>
              <button onClick={loadGraph} className="cmd-btn" disabled={graphLoading}>🕸️ {graphLoading ? 'Loading…' : 'Graph View'}</button>
            </div>

            {/* Vault Folders */}
            <div className="vault-folders">
              <h3>Vault Folders</h3>
              <button onClick={() => fillInput('Show all notes in notes/')} className="folder-btn">📁 notes/</button>
              <button onClick={() => fillInput('Show all notes in learning/')} className="folder-btn">📚 learning/</button>
              <button onClick={() => fillInput('Show all notes in projects/')} className="folder-btn">🎯 projects/</button>
            </div>

            {/* Chat History */}
            <div className="chat-history">
              <h3>Chat History</h3>
              <div className="chats-list">
                {chats.map((chat) => (
                  <div key={chat.id} className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}>
                    <button
                      className="chat-btn"
                      onClick={() => setCurrentChatId(chat.id)}
                      title={chat.title}
                    >
                      {chat.title}
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => deleteChat(chat.id)}
                      aria-label="Delete chat"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Settings */}
            <div className="settings">
              <button onClick={toggleTheme} className="theme-btn">
                {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
              </button>
              <button onClick={handleLogout} className="logout-btn">🚪 Logout</button>
            </div>
          </aside>

          {/* Sidebar Toggle */}
          {!sidebarOpen && (
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">☰</button>
          )}

          {/* Main Chat Area */}
          <div className="chat-container">
            <header className="header">
              <h1>Second Brain</h1>
              <p className="subtitle">Logged in as: {email}</p>
            </header>

            <div className="messages">
              {messages.length === 0 && !loading && (
                <div className="empty-state">
                  <p>Start chatting with your knowledge vault.</p>
                  <ul>
                    <li>&ldquo;List all my notes&rdquo;</li>
                    <li>&ldquo;Find notes about a topic&rdquo;</li>
                    <li>&ldquo;Create a note about…&rdquo;</li>
                  </ul>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role}`}>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))}
              {loading && (
                <div className="message assistant">
                  <div className="message-content thinking">Thinking…</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="input-form">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your vault..."
                disabled={loading}
                maxLength={8000}
                aria-label="Message"
              />
              <button type="submit" disabled={loading || !input.trim()}>
                {loading ? '…' : 'Send'}
              </button>
            </form>
          </div>

          {/* Graph Modal */}
          {graphOpen && (
            <div className="graph-modal-overlay" onClick={() => setGraphOpen(false)}>
              <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
                <div className="graph-header">
                  <h2>Vault Graph</h2>
                  <button className="graph-close" onClick={() => setGraphOpen(false)}>✕</button>
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
                    <div className="graph-empty">No notes found or no connections between notes yet.</div>
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
          --bg: #F5F3F0;                /* Cream */
          --bg-secondary: #EFECE6;      /* Slightly deeper cream for panels */
          --fg: #2D1F1A;                /* Deep Brown body text */
          --fg-strong: #1A1A1A;         /* Forest Floor Black */
          --border: rgba(74, 155, 111, 0.35);  /* Transparent Moss Green */
          --border-strong: #4A9B6F;     /* Moss Green */
          --accent: #1B8A6F;            /* Canopy Green */
          --accent-dark: #0B5F4C;       /* Deep Jungle Green */
          --gold: #D4A574;              /* Gold/Amber highlights */
          --danger: #B85C3C;            /* Terracotta */
          --info: #4ECDC4;              /* Water Blue */
          --muted: #7BA888;             /* Sage Green */
          --cream: #F5F3F0;
          --shadow-light: 0 1px 3px rgba(11, 95, 76, 0.08);
          --shadow-medium: 0 4px 12px rgba(11, 95, 76, 0.15);
          --shadow-deep: 0 8px 24px rgba(11, 95, 76, 0.25);
        }
        :root[data-theme='dark'] {
          --bg: #15201B;                /* Deep forest night */
          --bg-secondary: #1C2A23;
          --fg: #E8E4DC;                /* Cream-ish text */
          --fg-strong: #F5F3F0;
          --border: rgba(74, 155, 111, 0.35);
          --border-strong: #4A9B6F;
          --accent: #1B8A6F;
          --accent-dark: #23A585;       /* Hover lightens in the dark */
          --gold: #D4A574;
          --danger: #C96B4A;
          --info: #4ECDC4;
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
          transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        h1, h2 {
          font-family: Georgia, 'Crimson Text', serif;
          letter-spacing: -0.5px;
          line-height: 1.2;
          color: var(--fg-strong);
        }
        button {
          cursor: pointer;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        button:disabled { cursor: not-allowed; opacity: 0.6; }
        input {
          border: 1px solid var(--border-strong);
          border-radius: 6px;
          font-size: 16px;
          padding: 0.75rem 1rem;
          background: var(--bg);
          color: var(--fg);
          transition: border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        input::placeholder { color: var(--muted); font-style: italic; }
        input:focus {
          outline: none;
          border-color: var(--gold);
          box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.1);
        }

        /* Organic scrollbar */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--accent); }
      `}</style>

      <style jsx>{`
        .login-page {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-secondary);
          padding: 1rem;
        }
        .login-card {
          background: var(--bg);
          border-radius: 0.75rem;
          padding: 2.5rem 2rem;
          width: 100%;
          max-width: 400px;
          border: 1px solid var(--border);
          box-shadow: var(--shadow-light);
          text-align: center;
        }
        .login-card h1 { font-size: 2rem; font-weight: 600; }
        .subtitle { color: var(--muted); font-size: 0.9rem; margin-top: 0.25rem; }
        .login-card form { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem; }
        .login-card button {
          background: var(--accent);
          color: var(--cream);
          padding: 0.75rem;
          font-size: 1rem;
        }
        .login-card button:hover:not(:disabled) {
          background: var(--accent-dark);
          box-shadow: var(--shadow-medium);
          transform: translateY(-2px);
        }
        .error { color: var(--danger); margin-top: 1rem; font-size: 0.9rem; }

        .chat-page {
          height: 100%;
          display: flex;
          gap: 0;
        }

        .sidebar {
          width: 280px;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border);
          overflow-y: auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          transition: transform 300ms, width 300ms;
        }
        .sidebar.closed { transform: translateX(-100%); position: absolute; }

        .sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sidebar-header h2 { font-size: 1.25rem; }
        .close-btn { background: none; font-size: 1.5rem; padding: 0; color: var(--fg); }

        .new-chat-btn {
          background: var(--accent);
          color: var(--cream);
          padding: 0.75rem;
          width: 100%;
          font-size: 0.95rem;
        }
        .new-chat-btn:hover {
          background: var(--accent-dark);
          box-shadow: var(--shadow-medium);
          transform: translateY(-2px);
        }

        .quick-commands, .vault-folders, .chat-history, .settings {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .quick-commands h3, .vault-folders h3, .chat-history h3 { font-size: 0.9rem; color: var(--muted); text-transform: uppercase; margin-bottom: 0.5rem; }

        .cmd-btn, .folder-btn {
          background: var(--bg);
          border: 1px solid var(--border);
          padding: 0.6rem;
          text-align: left;
          color: var(--fg);
          font-size: 0.9rem;
        }
        .cmd-btn:hover, .folder-btn:hover { background: var(--accent); color: var(--cream); border-color: var(--accent); }

        .chats-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 300px;
          overflow-y: auto;
        }
        .chat-item {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        .chat-btn {
          flex: 1;
          background: var(--bg);
          border: 1px solid var(--border);
          padding: 0.6rem;
          text-align: left;
          color: var(--fg);
          font-size: 0.85rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chat-item.active .chat-btn { background: var(--accent); color: var(--cream); border-color: var(--accent); }
        .chat-btn:hover { background: var(--accent); color: var(--cream); }
        .delete-btn { background: none; color: var(--muted); padding: 0.4rem 0.6rem; font-size: 1rem; }
        .delete-btn:hover { color: var(--danger); }

        .settings {
          border-top: 1px solid var(--border);
          padding-top: 1rem;
          margin-top: auto;
        }
        .theme-btn, .logout-btn {
          background: var(--bg);
          border: 1px solid var(--border);
          padding: 0.75rem;
          width: 100%;
          color: var(--fg);
          text-align: left;
        }
        .theme-btn:hover { background: var(--accent); color: var(--cream); border-color: var(--accent); }
        .logout-btn { color: var(--danger); }
        .logout-btn:hover { background: var(--danger); color: var(--cream); border-color: var(--danger); }

        .sidebar-toggle {
          position: fixed;
          bottom: 2rem;
          left: 1rem;
          background: var(--accent);
          color: var(--cream);
          width: 3rem;
          height: 3rem;
          font-size: 1.5rem;
          z-index: 999;
          display: none;
        }
        .sidebar.closed ~ .sidebar-toggle { display: flex; align-items: center; justify-content: center; }

        .chat-container {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .header {
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
          padding: 1rem 2rem;
        }
        .header h1 { font-size: 1.5rem; font-weight: 600; }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .empty-state { margin: auto; text-align: center; color: var(--muted); }
        .empty-state ul { list-style: none; margin-top: 0.75rem; line-height: 1.8; }

        .message { display: flex; }
        .message.user { justify-content: flex-end; }
        .message.assistant { justify-content: flex-start; }
        .message-content {
          max-width: 70%;
          padding: 0.75rem 1rem;
          border-radius: 0.75rem;
          white-space: pre-wrap;
          word-break: break-word;
          animation: slideUp 200ms ease-out;
        }
        .message.user .message-content { background: var(--accent); color: var(--cream); }
        .message.assistant .message-content { background: var(--bg-secondary); color: var(--fg); }
        .thinking { font-style: italic; color: var(--muted); }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .input-form {
          display: flex;
          gap: 0.75rem;
          padding: 1rem 2rem;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border);
        }
        .input-form input { flex: 1; }
        .input-form button {
          background: var(--accent);
          color: var(--cream);
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
        }
        .input-form button:hover:not(:disabled) {
          background: var(--accent-dark);
          box-shadow: var(--shadow-medium);
          transform: translateY(-2px);
        }

        @media (max-width: 900px) {
          .sidebar { width: 250px; }
        }

        @media (max-width: 768px) {
          .chat-page { flex-direction: column; }
          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            width: 280px;
            height: 100vh;
            z-index: 1000;
            transform: translateX(0);
          }
          .sidebar.closed { transform: translateX(-100%); }
          .chat-container { width: 100%; }
          .messages { padding: 1rem; }
          .message-content { max-width: 90%; }
          .input-form { padding: 0.75rem 1rem; }
        }

        .graph-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
        }
        .graph-modal {
          background: var(--bg);
          border-radius: 0.75rem;
          width: 90%;
          max-width: 900px;
          height: 80vh;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border);
          box-shadow: var(--shadow-deep);
        }
        .graph-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid var(--border);
        }
        .graph-header h2 { font-size: 1.5rem; margin: 0; }
        .graph-close {
          background: none;
          color: var(--fg);
          font-size: 1.5rem;
          padding: 0;
          cursor: pointer;
        }
        .graph-close:hover { color: var(--danger); }
        .graph-container {
          flex: 1;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .graph-loading {
          text-align: center;
          color: var(--muted);
          font-size: 1rem;
        }
        .graph-empty {
          text-align: center;
          color: var(--muted);
          font-size: 1rem;
          padding: 2rem;
        }

        @media (max-width: 768px) {
          .graph-modal {
            width: 95%;
            height: 70vh;
          }
        }
      `}</style>
    </>
  );
}
