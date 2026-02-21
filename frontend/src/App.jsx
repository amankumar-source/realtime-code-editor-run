import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import { v4 as uuid } from "uuid";

// Socket instantiated once at module level — persists across re-renders
const socket = io("https://realtime-code-editor-run.onrender.com", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

// File extension map is a static constant — keep outside component to avoid recreation
const FILE_EXTENSIONS = {
  javascript: "js",
  python: "py",
  java: "java",
  cpp: "cpp",
};

// Code execution version pinned to "*" — static, no need in state
const CODE_VERSION = "*";

// Detect mobile once at startup — avoids window.innerWidth reads every render
const IS_MOBILE = window.innerWidth <= 768;

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("// Start code here");
  const [copySuccess, setCopySuccess] = useState(false);
  const [users, setUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [output, setOutput] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [theme, setTheme] = useState("dark");
  const [toast, setToast] = useState("");

  const typingTimeoutRef = useRef(null);
  // Track toast clearance timeout so we can cancel it on new toasts
  const toastTimeoutRef = useRef(null);
  const copyTimeoutRef = useRef(null);

  // --- Socket: connection status listeners ---
  useEffect(() => {
    const onConnect = () => setConnectionStatus("Connected");
    const onDisconnect = () => setConnectionStatus("Disconnected");
    const onConnectError = () => setConnectionStatus("Connection Failed");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, []);

  // --- Socket: room/code event listeners ---
  useEffect(() => {
    const handleUserJoined = (users) => setUsers(users);
    const handleCodeUpdate = (newCode) => setCode(newCode);

    const handleTyping = (user) => {
      setTypingUser(user);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 1500);
    };

    const handleLanguageUpdate = (newLanguage) => setLanguage(newLanguage);

    const handleCodeResponse = (response) => {
      setOutput(response.run?.output || response.error || "");
    };

    const handleToast = (message) => {
      // Cancel any pending toast clear before setting new one
      clearTimeout(toastTimeoutRef.current);
      setToast(message);
      toastTimeoutRef.current = setTimeout(() => setToast(""), 3000);
    };

    socket.on("userJoined", handleUserJoined);
    socket.on("codeUpdate", handleCodeUpdate);
    socket.on("userTyping", handleTyping);
    socket.on("languageUpdate", handleLanguageUpdate);
    socket.on("codeResponse", handleCodeResponse);
    socket.on("toast", handleToast);

    return () => {
      socket.off("userJoined", handleUserJoined);
      socket.off("codeUpdate", handleCodeUpdate);
      socket.off("userTyping", handleTyping);
      socket.off("languageUpdate", handleLanguageUpdate);
      socket.off("codeResponse", handleCodeResponse);
      socket.off("toast", handleToast);
    };
  }, []);

  // --- Notify server on page unload ---
  useEffect(() => {
    const handleBeforeUnload = () => socket.emit("leaveRoom");
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // --- Sync theme to <html> data attribute ---
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // --- Cleanup pending timeouts on unmount ---
  useEffect(() => {
    return () => {
      clearTimeout(typingTimeoutRef.current);
      clearTimeout(toastTimeoutRef.current);
      clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // --- Stable Monaco editor options object — recreated only when mobile flag is set ---
  // Avoids passing a new object reference on every render, preventing Monaco re-initialization
  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      fontSize: IS_MOBILE ? 14 : 16,
      wordWrap: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      scrollbar: {
        useShadows: false,
        verticalHasArrows: true,
        horizontalHasArrows: true,
        vertical: "visible",
        horizontal: "visible",
        verticalScrollbarSize: IS_MOBILE ? 14 : 17,
        horizontalScrollbarSize: IS_MOBILE ? 14 : 17,
      },
      mouseWheelZoom: true,
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true,
      selectOnLineNumbers: true,
      lineNumbersMinChars: IS_MOBILE ? 3 : 5,
    }),
    [] // IS_MOBILE is computed once — stable for the lifetime of the app
  );

  const joinRoom = useCallback(() => {
    if (roomId && userName) {
      socket.emit("join", { roomId, userName });
      setJoined(true);
    }
  }, [roomId, userName]);

  const leaveRoom = useCallback(() => {
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomId("");
    setUserName("");
    setCode("// Start code here");
    setLanguage("javascript");
  }, []);

  const copyRoomId = useCallback(() => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(roomId);
      } else {
        // Fallback for non-HTTPS contexts
        const textArea = document.createElement("textarea");
        textArea.value = roomId;
        textArea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopySuccess(true);
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 1500);
    } catch {
      // Silently fail — clipboard errors are non-critical
    }
  }, [roomId]);

  const handleCodeChange = useCallback(
    (newCode = "") => {
      setCode(newCode);
      if (roomId) {
        socket.emit("codeChange", { roomId, code: newCode });
        socket.emit("typing", { roomId, userName });
      }
    },
    [roomId, userName]
  );

  const handleLanguageChange = useCallback(
    (e) => {
      const newLanguage = e.target.value;
      setLanguage(newLanguage);
      if (roomId) {
        socket.emit("languageChange", { roomId, language: newLanguage });
      }
    },
    [roomId]
  );

  const runCode = useCallback(() => {
    if (roomId) {
      socket.emit("compileCode", {
        code,
        roomId,
        language,
        version: CODE_VERSION,
      });
    }
  }, [roomId, code, language]);

  const createRoomId = useCallback(() => {
    setRoomId(uuid());
  }, []);

  // Memoized to prevent re-creation every render — only changes when language/code changes
  const downloadCode = useCallback(() => {
    const extension = FILE_EXTENSIONS[language] || "txt";
    const blob = new Blob([code], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `code.${extension}`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [language, code]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // Derive tab label from language — memoized to avoid recalc on unrelated state changes
  const tabLabel = useMemo(() => {
    const ext = FILE_EXTENSIONS[language] || language;
    return `main.${ext}`;
  }, [language]);

  const monacoTheme = theme === "dark" ? "vs-dark" : "vs-light";

  if (!joined) {
    return (
      <div className="join-container">
        <div className="app-header">
          <div className="logo-wrapper">
            <svg
              className="code-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </div>
          <h1 className="app-title">CodeJunction</h1>
          <p className="app-description">Collaborative coding in real-time</p>
          <div className="status-badge" role="status" aria-live="polite">
            <span
              className={`status-dot ${connectionStatus.toLowerCase().replace(" ", "-")}`}
              aria-hidden="true"
            ></span>
            <span className="status-text">{connectionStatus}</span>
          </div>
        </div>
        <div className="join-form">
          <div className="input-group">
            <label htmlFor="room-id-input">Room ID</label>
            <input
              id="room-id-input"
              type="text"
              placeholder="Enter room ID or create new"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          <button className="create-id-button" onClick={createRoomId}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Generate New Room
          </button>
          <div className="input-group">
            <label htmlFor="user-name-input">Your Name</label>
            <input
              id="user-name-input"
              type="text"
              placeholder="Enter your display name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              autoComplete="nickname"
              spellCheck="false"
            />
          </div>
          <button className="join-button" onClick={joinRoom}>
            Join Collaboration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="sidebar" role="complementary" aria-label="Room sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">CodeJunction</h2>
          <div
            className="connection-indicator"
            role="status"
            aria-live="polite"
          >
            <span
              className={`connection-dot ${connectionStatus.toLowerCase().replace(" ", "-")}`}
              aria-hidden="true"
            ></span>
            <span className="connection-text">{connectionStatus}</span>
          </div>
        </div>
        <div className="room-info">
          <label className="info-label">Room ID</label>
          <div className="room-id-box">
            <span className="room-id-text" title={roomId}>
              {roomId.slice(0, 16)}...
            </span>
            <button
              className="copy-inside-btn"
              onClick={copyRoomId}
              title="Copy Room ID"
              aria-label="Copy room ID to clipboard"
            >
              {copySuccess ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
        <div className="users-section">
          <h3 className="section-title">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Active Users ({users.length})
          </h3>
          <ul className="users-list" aria-label="Active users">
            {users.map((user) => (
              // Use user name as key (names are unique per room) instead of index
              // — prevents unnecessary DOM reconciliation when order changes
              <li key={user} className="user-item">
                <div className="user-avatar" aria-hidden="true">
                  {user.charAt(0).toUpperCase()}
                </div>
                <span className="user-name">{user.slice(0, 12)}</span>
                {typingUser === user && (
                  <span className="typing-dots" aria-label="typing">
                    •••
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="controls-section">
          <label className="control-label" htmlFor="language-selector">
            Language
          </label>
          <select
            id="language-selector"
            className="language-selector"
            value={language}
            onChange={handleLanguageChange}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>
          <button className="leave-button" onClick={leaveRoom}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Leave Room
          </button>
        </div>
      </div>
      <div className="editor-wrapper" role="main">
        <div className="editor-header">
          <div className="editor-tabs" aria-label="Open files">
            <div className="editor-tab active">
              <span className="tab-icon" aria-hidden="true">●</span>
              <span className="tab-name">{tabLabel}</span>
            </div>
          </div>
          <div className="editor-actions">
            <button
              className="action-btn theme-toggle-btn"
              onClick={toggleTheme}
              title="Toggle theme"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
            </button>
            <button
              className="action-btn download-btn"
              onClick={downloadCode}
              aria-label="Download code file"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </button>
            <button
              className="action-btn run-btn"
              onClick={runCode}
              aria-label="Run code"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Run Code
            </button>
          </div>
        </div>
        <div className="editor-content">
          <Editor
            height="100%"
            defaultLanguage={language}
            language={language}
            value={code}
            onChange={handleCodeChange}
            theme={monacoTheme}
            options={editorOptions}
          />
        </div>
        <div className="output-section" role="region" aria-label="Code output">
          <div className="output-header">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="4 17 10 11 4 5"></polyline>
              <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <span>Output</span>
          </div>
          <textarea
            className="output-console"
            value={output}
            readOnly
            placeholder="output will appear here..."
            aria-label="Code execution output"
          />
        </div>
      </div>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
};

export default App;
