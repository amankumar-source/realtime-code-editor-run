import { useEffect, useState, useCallback } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import { v4 as uuid } from "uuid";

const socket = io("https://realtime-code-editor-run.onrender.com", {
  transports: ["websocket"],   // USE ONLY WEBSOCKET
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
  const [typing, setTyping] = useState("");
  const [output, setOutput] = useState("");
  const [version] = useState("*");
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");

  // Connection status handlers
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
      setTyping(`${user.slice(0, 8)}... is Typing`);
      setTimeout(() => setTyping(""), 2000);
    };
    const handleLanguageUpdate = (newLanguage) => setLanguage(newLanguage);
    const handleCodeResponse = (response) => {
      setOutput(response.run?.output || response.error || "");
    };

    socket.on("userJoined", handleEvent);
    socket.on("codeUpdate", handleCodeUpdate);
    socket.on("userTyping", handleTyping);
    socket.on("languageUpdate", handleLanguageUpdate);
    socket.on("codeResponse", handleCodeResponse);

    return () => {
      socket.off("userJoined", handleEvent);
      socket.off("codeUpdate", handleCodeUpdate);
      socket.off("userTyping", handleTyping);
      socket.off("languageUpdate", handleLanguageUpdate);
      socket.off("codeResponse", handleCodeResponse);
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

  // connection status
  if (!joined) {
    return (
      <div className="join-container">
        <div className="app-header">
          <svg className="code-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64">
            <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
          </svg>
          <h1 className="app-title">Realtime Code Editor</h1>
          <p className="app-description">
            Status: <span className={`status ${connectionStatus.toLowerCase()}`}>{connectionStatus}</span>
          </p>
        </div>
        
        <div className="join-form">
          <input type="text" placeholder="Room Id" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          <button className="create-id-button" onClick={createRoomId}>Create Id</button>
          <input type="text" placeholder="Your Name" value={userName} onChange={(e) => setUserName(e.target.value)} />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      </div>
    );
  }

  //download feature 
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
        <div className="room-info">
          <h2>Code Room: {roomId}</h2>
          <div>Status: <span className={`status ${connectionStatus.toLowerCase()}`}>{connectionStatus}</span></div>
          <button onClick={copyRoomId} className="copy-button">Copy Id</button>
          {copySuccess && <span className="copy-success">{copySuccess}</span>}
        </div>
        
        <h3>Users in Room</h3>
        <ul>{users.map((user, index) => <li key={index}>{user.slice(0, 8)}...</li>)}</ul>
        <p className="typing-indicator">{typing}</p>
        <select className="language-selector" value={language} onChange={handleLanguageChange}>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
        </select>
        <button className="leave-button" onClick={leaveRoom}>Leave Room</button>
      </div>
      
      <div className="editor-wrapper">
        <Editor
          height={"60%"}
          defaultLanguage={language}
          language={language}
          value={code}
          onChange={handleCodeChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: window.innerWidth <= 768 ? 14 : 20,
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
        <button className="run-btn" onClick={runCode}>Execute Code</button>
        <button className="download-btn" onClick={downloadCode}>Download Code ⬇️</button>

        <textarea className="output-console" value={output} readOnly placeholder="Output will appear here..." />
      </div>
    </div>
  );
};

export default App;


