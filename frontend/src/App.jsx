import { useEffect, useState, useCallback } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import { v4 as uuid } from "uuid";

// NEW CODE - Uses the production URL
const socket = io("https://realtime-code-editor-run.onrender.com", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("// Start code here");
  const [copySuccess, setCopySuccess] = useState("");
  const [users, setUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [output, setOutput] = useState("");
  const [version] = useState("*");
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [theme, setTheme] = useState("dark");
  const [toast, setToast] = useState("");



  useEffect(() => {
    socket.on("connect", () => {
      console.log("✅ Connected:", socket.id);
      setConnectionStatus("Connected");
    });

    socket.on("disconnect", (reason) => {
      console.log("❌ Disconnected:", reason);
      setConnectionStatus("Disconnected");
    });

    socket.on("connect_error", (error) => {
      console.log("🚨 Connection error:", error.message);
      setConnectionStatus("Connection Failed");
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
    };
  }, []);



  useEffect(() => {
    const handleEvent = (users) => setUsers(users);
    const handleCodeUpdate = (newCode) => setCode(newCode);
    const handleTyping = (user) => {
  setTypingUser(user);
  setTimeout(() => setTypingUser(null), 1500);
};

    const handleLanguageUpdate = (newLanguage) => setLanguage(newLanguage);
    const handleCodeResponse = (response) => {
      setOutput(response.run?.output || response.error || "");
    };
    const handleToast = (message) => {
  setToast(message);
  setTimeout(() => setToast(""), 3000);
};


    socket.on("userJoined", handleEvent);
    socket.on("codeUpdate", handleCodeUpdate);
    socket.on("userTyping", handleTyping);
    socket.on("languageUpdate", handleLanguageUpdate);
    socket.on("codeResponse", handleCodeResponse);
    socket.on("toast", handleToast);


    return () => {
      socket.off("userJoined", handleEvent);
      socket.off("codeUpdate", handleCodeUpdate);
      socket.off("userTyping", handleTyping);
      socket.off("languageUpdate", handleLanguageUpdate);
      socket.off("codeResponse", handleCodeResponse);
      socket.off("toast", handleToast);

      
    };

    
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      socket.emit("leaveRoom");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

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
    navigator.clipboard.writeText(roomId);
    setCopySuccess("Copied!");
    setTimeout(() => setCopySuccess(""), 2000);
  }, [roomId]);

  const handleCodeChange = useCallback((newCode) => {
    setCode(newCode);
    if (roomId) {
      socket.emit("codeChange", { roomId, code: newCode });
      socket.emit("typing", { roomId, userName });
    }
  }, [roomId, userName]);

  const handleLanguageChange = useCallback((e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    if (roomId) {
      socket.emit("languageChange", { roomId, language: newLanguage });
    }
  }, [roomId]);

  const runCode = useCallback(() => {
    if (roomId) {
      socket.emit("compileCode", { code, roomId, language, version });
    }
  }, [roomId, code, language, version]);

  const createRoomId = useCallback(() => {
    const newRoomId = uuid();
    setRoomId(newRoomId);
  }, []);

 // Add this useEffect to App.js
useEffect(() => {
  document.documentElement.setAttribute("data-theme", theme);
}, [theme]);

const toggleTheme = useCallback(() => {
  setTheme(prevTheme => prevTheme === "dark" ? "light" : "dark");
}, []);

  if (!joined) {
    return (
      <div className="join-container">
        <div className="app-header">
          <div className="logo-wrapper">
            <svg className="code-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
          </div>
          <h1 className="app-title">CodeJunction</h1>
          <p className="app-description">Collaborative coding in real-time</p>
          <div className="status-badge">
            <span className={`status-dot ${connectionStatus.toLowerCase()}`}></span>
            <span className="status-text">{connectionStatus}</span>
          </div>
        </div>
        <div className="join-form">
          <div className="input-group">
            <label>Room ID</label>
            <input type="text" placeholder="Enter room ID or create new" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          </div>
          <button className="create-id-button" onClick={createRoomId}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Generate New Room
          </button>
          <div className="input-group">
            <label>Your Name</label>
            <input type="text" placeholder="Enter your display name" value={userName} onChange={(e) => setUserName(e.target.value)} />
          </div>
          <button className="join-button" onClick={joinRoom}>Join Collaboration</button>
        </div>
      </div>
    );
  }

  const downloadCode = () => {
    const fileExtensions = {
      javascript: "js",
      python: "py",
      java: "java",
      cpp: "cpp"
    };

    const extension = fileExtensions[language] || "txt";
    const filename = `code.${extension}`;

    const blob = new Blob([code], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="editor-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">CodeJunction</h2>
          <div className="connection-indicator">
            <span className={`connection-dot ${connectionStatus.toLowerCase()}`}></span>
            <span className="connection-text">{connectionStatus}</span>
          </div>
        </div>
        <div className="room-info">
          <label className="info-label">Room ID</label>
          <div className="room-id-display">{roomId.slice(0, 16)}...</div>
          <button onClick={copyRoomId} className="copy-button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            {copySuccess || "Copy ID"}
          </button>
        </div>
        <div className="users-section">
          <h3 className="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Active Users ({users.length})
          </h3>
          <ul className="users-list">
            {users.map((user, index) => (
              <li key={index} className="user-item">
                <div className={`user-avatar ${typingUser === user ? "typing" : ""}`}>
  {user.charAt(0).toUpperCase()}
  {typingUser === user && <span className="typing-dots">•••</span>}
</div>

                <span className="user-name">
  {user.slice(0, 12)}
  {typingUser === user && <span className="typing-wave">~~~</span>}
</span>

              </li>
            ))}
          </ul>
          
        </div>
        <div className="controls-section">
          <label className="control-label">Language</label>
          <select className="language-selector" value={language} onChange={handleLanguageChange}>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>
          <button className="leave-button" onClick={leaveRoom}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Leave Room
          </button>
        </div>
      </div>
      <div className="editor-wrapper">
        <div className="editor-header">
          <div className="editor-tabs">
            <div className="editor-tab active">
              <span className="tab-icon">●</span>
              <span className="tab-name">main.{language === 'javascript' ? 'js' : language === 'python' ? 'py' : language === 'java' ? 'java' : 'cpp'}</span>
            </div>
          </div>
          <div className="editor-actions">
            <button className="action-btn theme-toggle-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
            </button>
            <button className="action-btn download-btn" onClick={downloadCode}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </button>
            <button className="action-btn run-btn" onClick={runCode}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            theme={theme === "dark" ? "vs-dark" : "vs-light"}
            options={{
              minimap: { enabled: false },
              fontSize: window.innerWidth <= 768 ? 14 : 16,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              scrollbar: {
                useShadows: false,
                verticalHasArrows: true,
                horizontalHasArrows: true,
                vertical: "visible",
                horizontal: "visible",
                verticalScrollbarSize: window.innerWidth <= 768 ? 14 : 17,
                horizontalScrollbarSize: window.innerWidth <= 768 ? 14 : 17,
              },
              mouseWheelZoom: true,
              cursorSmoothCaretAnimation: true,
              smoothScrolling: true,
              selectOnLineNumbers: true,
              lineNumbersMinChars: window.innerWidth <= 768 ? 3 : 5,
            }}
          />
        </div>
        <div className="output-section">
          <div className="output-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5"></polyline>
              <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <span>Output Console</span>
          </div>
          <textarea className="output-console" value={output} readOnly placeholder="Code output will appear here..." />
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}

    </div>
  );
};

export default App;


 