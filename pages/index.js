import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Restore session on mount; if the access token is stale, try the
  // refresh cookie before forcing a new login.
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const savedEmail = localStorage.getItem('email');
    if (token && savedEmail) {
      setAccessToken(token);
      setEmail(savedEmail);
      setAuthenticated(true);
    } else if (savedEmail) {
      fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.accessToken) {
            localStorage.setItem('accessToken', data.accessToken);
            setAccessToken(data.accessToken);
            setEmail(savedEmail);
            setAuthenticated(true);
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('email');
    setAccessToken('');
    setMessages([]);
    setAuthenticated(false);
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.error || 'Invalid credentials');
        setTimeout(() => setLoginError(''), 5000);
        return;
      }
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('email', email);
      setAccessToken(data.accessToken);
      setAuthenticated(true);
    } catch {
      setLoginError('Error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
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
      const reply = res.ok
        ? data.response
        : data.error || 'Error communicating with vault.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error. Please check your connection.' },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
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
              <button type="submit" disabled={loading}>
                {loading ? 'Authenticating…' : 'Login'}
              </button>
            </form>
            {loginError && <p className="error" role="alert">{loginError}</p>}
          </div>
        </main>
      ) : (
        <main className="chat-page">
          <header className="header">
            <div>
              <h1>Second Brain</h1>
              <p className="subtitle">Logged in as: {email}</p>
            </div>
            <button onClick={handleLogout} className="logout-btn" aria-label="Log out">
              Logout
            </button>
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
        </main>
      )}

      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #__next { height: 100%; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 0.95rem;
          color: #222;
          background: #fff;
        }
        button { cursor: pointer; border: none; border-radius: 0.5rem; transition: background 200ms; }
        button:disabled { cursor: not-allowed; opacity: 0.6; }
        input {
          border: 1px solid #e0e0e0;
          border-radius: 0.5rem;
          font-size: 16px; /* prevents iOS auto-zoom */
          padding: 0.75rem 1rem;
          transition: border-color 200ms, box-shadow 200ms;
        }
        input:focus {
          outline: none;
          border-color: #0066cc;
          box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.15);
        }
      `}</style>

      <style jsx>{`
        .login-page {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          padding: 1rem;
        }
        .login-card {
          background: #fff;
          border-radius: 0.75rem;
          padding: 2.5rem 2rem;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
          text-align: center;
        }
        .login-card h1 { font-size: 2rem; font-weight: 600; }
        .subtitle { color: #666; font-size: 0.9rem; margin-top: 0.25rem; }
        .login-card form { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem; }
        .login-card button {
          background: #0066cc;
          color: #fff;
          padding: 0.75rem;
          font-size: 1rem;
        }
        .login-card button:hover:not(:disabled) { background: #0052a3; }
        .error { color: #dc3545; margin-top: 1rem; font-size: 0.9rem; }

        .chat-page { height: 100%; display: flex; flex-direction: column; }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
          padding: 1rem 2rem;
        }
        .header h1 { font-size: 1.5rem; font-weight: 600; }
        .logout-btn {
          background: #dc3545;
          color: #fff;
          padding: 0.5rem 1.25rem;
          font-size: 0.9rem;
        }
        .logout-btn:hover { background: #b02a37; }

        .messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .empty-state {
          margin: auto;
          text-align: center;
          color: #999;
        }
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
        .message.user .message-content { background: #0066cc; color: #fff; }
        .message.assistant .message-content { background: #f0f0f0; color: #222; }
        .thinking { font-style: italic; color: #999; }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .input-form {
          display: flex;
          gap: 0.75rem;
          padding: 1rem 2rem;
          background: #f5f5f5;
          border-top: 1px solid #e0e0e0;
        }
        .input-form input { flex: 1; }
        .input-form button {
          background: #0066cc;
          color: #fff;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
        }
        .input-form button:hover:not(:disabled) { background: #0052a3; }

        @media (max-width: 768px) {
          .header { padding: 1rem; }
          .messages { padding: 1rem; }
          .message-content { max-width: 90%; }
          .input-form { padding: 0.75rem 1rem; }
        }
      `}</style>
    </>
  );
}
