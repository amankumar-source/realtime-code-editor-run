import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import axios from "axios";

const app = express();
const server = http.createServer(app);

const url = `https://realtime-code-editor-run.onrender.com`;
const interval = 30000;

function reloadWebsite() {
  axios
    .get(url)
    .then((response) => {
      console.log("website reloaded");
    })
    .catch((error) => {
      console.error(`Error : ${error.message}`);
    });
}

setInterval(reloadWebsite, interval);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket"], // << IMPORTANT FIX
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6,
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("user connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  // Connection events for debugging
  socket.on("connect", () => {
    console.log(`Socket ${socket.id} connected successfully`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`Socket ${socket.id} disconnected:`, reason);
    if (currentRoom && currentUser) {
      rooms.get(currentRoom)?.users?.delete(currentUser);
      if (rooms.has(currentRoom)) {
        io.to(currentRoom).emit(
          "userJoined",
          Array.from(rooms.get(currentRoom).users)
        );
      }
    }
  });

  socket.on("join", ({ roomId, userName }) => {
    if (currentRoom) {
      socket.leave(currentRoom);
      rooms.get(currentRoom)?.users?.delete(currentUser);
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
    socket.emit("codeUpdate", rooms.get(roomId).code);
    io.to(roomId).emit("userJoined", Array.from(rooms.get(roomId).users));
  });

  socket.on("codeChange", ({ roomId, code }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).code = code;
      socket.to(roomId).emit("codeUpdate", code);
    }
  });

  socket.on("leaveRoom", () => {
    if (currentRoom && currentUser) {
      rooms.get(currentRoom)?.users?.delete(currentUser);
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

  socket.on("compileCode", async ({ code, roomId, language, version }) => {
    if (rooms.has(roomId)) {
      try {
        const response = await axios.post(
          "https://emkc.org/api/v2/piston/execute",
          {
            language,
            version,
            files: [{ content: code }],
          }
        );
        rooms.get(roomId).output = response.data.run.output;
        io.to(roomId).emit("codeResponse", response.data);
      } catch (error) {
        io.to(roomId).emit("codeResponse", { error: error.message });
      }
    }
  });
});

const port = process.env.PORT || 5000;
const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "/frontend/dist")));
app.get("", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

server.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
