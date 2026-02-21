import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import axios from "axios";

const app = express();
const server = http.createServer(app);

// ─── Keep-Alive Ping (prevents Render free-tier from sleeping) ──────────────
// Fires every 14 minutes — generous enough to prevent spin-down without hammering
const RENDER_URL = "https://realtime-code-editor-run.onrender.com";
const keepAlive = setInterval(() => {
  axios.get(RENDER_URL).catch(() => { });
}, 14 * 60 * 1000); // 14 minutes

// Clean up keep-alive on graceful shutdown so the process can exit
process.on("SIGTERM", () => {
  clearInterval(keepAlive);
  server.close();
});

// ─── Socket.IO Setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6, // 1 MB per message — prevents memory abuse
});

// ─── In-Memory Room State ─────────────────────────────────────────────────────
const rooms = new Map();

// ─── Per-socket rate limiting for compileCode ─────────────────────────────────
// Prevents a single user from flooding the Piston API
const COMPILE_COOLDOWN_MS = 3000; // 3 seconds between runs per socket
const lastCompileTime = new Map();

io.on("connection", (socket) => {
  // Skip verbose "user connected" log in production — reduces log noise
  let currentRoom = null;
  let currentUser = null;

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    if (!currentRoom || !currentUser) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    room.users.delete(currentUser);
    io.to(currentRoom).emit("toast", `${currentUser} disconnected`);
    io.to(currentRoom).emit("userJoined", Array.from(room.users));

    if (room.users.size === 0) {
      rooms.delete(currentRoom);
    }

    // Clean up rate-limit entry for this socket
    lastCompileTime.delete(socket.id);

    currentRoom = null;
    currentUser = null;
  });

  // ── join ──────────────────────────────────────────────────────────────────
  socket.on("join", ({ roomId, userName }) => {
    // Guard: leave existing room cleanly before joining a new one
    if (currentRoom) {
      socket.leave(currentRoom);
      const prevRoom = rooms.get(currentRoom);
      if (prevRoom) {
        prevRoom.users.delete(currentUser);
        io.to(currentRoom).emit(
          "userJoined",
          Array.from(prevRoom.users)
        );
      }
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Set(), code: "// start code here" });
    }

    const room = rooms.get(roomId);
    room.users.add(userName);

    io.to(roomId).emit("toast", `${userName} joined the room`);
    // Send current code state to the newly joined socket only
    socket.emit("codeUpdate", room.code);
    io.to(roomId).emit("userJoined", Array.from(room.users));
  });

  // ── codeChange ────────────────────────────────────────────────────────────
  socket.on("codeChange", ({ roomId, code }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    // Store latest code; broadcast to others (not sender)
    room.code = code;
    socket.to(roomId).emit("codeUpdate", code);
  });

  // ── leaveRoom ─────────────────────────────────────────────────────────────
  socket.on("leaveRoom", () => {
    if (!currentRoom || !currentUser) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    // Emit toast BEFORE removing user so they receive it too
    io.to(currentRoom).emit("toast", `${currentUser} left the room`);

    room.users.delete(currentUser);
    io.to(currentRoom).emit("userJoined", Array.from(room.users));

    socket.leave(currentRoom);

    if (room.users.size === 0) {
      rooms.delete(currentRoom);
    }

    currentRoom = null;
    currentUser = null;
  });

  // ── typing ────────────────────────────────────────────────────────────────
  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });

  // ── languageChange ────────────────────────────────────────────────────────
  socket.on("languageChange", ({ roomId, language }) => {
    io.to(roomId).emit("languageUpdate", language);
  });

  // ── compileCode ───────────────────────────────────────────────────────────
  socket.on("compileCode", async ({ code, roomId, language, version }) => {
    if (!rooms.has(roomId)) return;

    // Rate limit: reject if socket has compiled within the cooldown window
    const now = Date.now();
    const last = lastCompileTime.get(socket.id) ?? 0;
    if (now - last < COMPILE_COOLDOWN_MS) {
      io.to(roomId).emit("codeResponse", {
        run: { output: `⏳ Please wait ${Math.ceil((COMPILE_COOLDOWN_MS - (now - last)) / 1000)}s before running again.` },
      });
      return;
    }
    lastCompileTime.set(socket.id, now);

    try {
      const response = await axios.post(
        "https://emkc.org/api/v2/piston/execute",
        {
          language,
          version,
          files: [{ content: code }],
        },
        {
          timeout: 15000, // 15s timeout — Piston occasionally hangs; prevents zombie requests
        }
      );
      rooms.get(roomId).output = response.data.run.output;
      io.to(roomId).emit("codeResponse", response.data);
    } catch (error) {
      io.to(roomId).emit("codeResponse", {
        run: { output: `Error: ${error.message}` },
      });
    }
  });
});

// ─── Static File Serving ──────────────────────────────────────────────────────
const port = process.env.PORT || 5000;
const __dirname = path.resolve();

// Serve frontend build with aggressive caching for hashed assets
// Vite generates content-hashed filenames (e.g. index-abc123.js) — safe to cache forever
app.use(
  "/assets",
  express.static(path.join(__dirname, "/frontend/dist/assets"), {
    maxAge: "1y",          // 365 days — hashed assets never change in content
    immutable: true,       // Tells CDNs/browsers: never revalidate
    etag: false,           // Hash in filename is the ETag — skip redundant header
    lastModified: false,
  })
);

// Serve other static files (favicon, etc.) with short-lived cache
app.use(
  express.static(path.join(__dirname, "/frontend/dist"), {
    maxAge: "1h",
    etag: true,
  })
);

// SPA fallback — serve index.html for all non-asset routes
// Cache for 1 minute so new deploys propagate quickly
app.get("*", (req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
