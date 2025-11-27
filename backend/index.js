import express from "express";
import http from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import axios from "axios";

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Map to store rooms and code
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  let currentRoom = null;
  let currentUser = null;

  socket.on("join", ({ roomId, userName }) => {
    if (currentRoom && rooms.has(currentRoom)) {
      socket.leave(currentRoom);
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit(
        "userJoined",
        Array.from(rooms.get(currentRoom).users)
      );
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Set(), code: "// start code here" });
    }

    rooms.get(roomId).users.add(userName);

    // Send current code to the new user
    socket.emit("codeUpdate", rooms.get(roomId).code);

    io.to(roomId).emit("userJoined", Array.from(rooms.get(currentRoom).users));
  });

  socket.on("codeChange", ({ roomId, code }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).code = code;
    }
    socket.to(roomId).emit("codeUpdate", code);
  });

  socket.on("leaveRoom", () => {
    if (currentRoom && currentUser && rooms.has(currentRoom)) {
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit(
        "userJoined",
        Array.from(rooms.get(currentRoom).users)
      );
      socket.leave(currentRoom);

      currentRoom = null;
      currentUser = null;
    }
  });

  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });

  socket.on("languageChange", ({ roomId, language }) => {
    io.to(roomId).emit("languageUpdate", language);
  });

  socket.on(
    "compileCode",
    async ({ code, roomId, language, version, input }) => {
      if (rooms.has(roomId)) {
        try {
          const room = rooms.get(roomId);
          const response = await axios.post(
            "https://emkc.org/api/v2/piston/execute",
            {
              language,
              version,
              files: [{ content: code }],
              stdin: input,
            }
          );

          room.output = response.data.run.output;
          io.to(roomId).emit("codeResponse", response.data);
        } catch (error) {
          io.to(roomId).emit("codeResponse", { error: error.message });
        }
      }
    }
  );

  socket.on("disconnect", () => {
    if (currentRoom && currentUser && rooms.has(currentRoom)) {
      rooms.get(currentRoom).users.delete(currentUser);
      io.to(currentRoom).emit(
        "userJoined",
        Array.from(rooms.get(currentRoom).users)
      );
    }
    console.log("User Disconnected:", socket.id);
  });
});

// Port and ES module-friendly __dirname
const port = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve frontend static files
app.use(express.static(join(__dirname, "/frontend/dist")));

// React routing fallback
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "frontend", "dist", "index.html"));
});

server.listen(port, () => {
  console.log("Server is running on port", port);
});
