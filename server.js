const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/health", (_, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

const rooms = new Map();
const userRooms = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.on("create_room", ({ roomName, user }) => {
    const code = generateRoomCode();
    const room = { name: roomName, code, users: [{ id: socket.id, name: user.name }] };
    rooms.set(code, room);
    userRooms.set(socket.id, code);
    socket.join(code);
    socket.emit("room_created", room);
  });

  socket.on("join_room", ({ roomCode, user }) => {
    const room = rooms.get(roomCode);
    if (!room) return socket.emit("room_not_found");
    room.users.push({ id: socket.id, name: user.name });
    userRooms.set(socket.id, roomCode);
    socket.join(roomCode);
    socket.emit("room_joined", { room, users: room.users });
    socket.to(roomCode).emit("user_joined", user);
  });

  socket.on("get_room_users", ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (room) socket.emit("room_users", room.users);
  });

  socket.on("send_message", (message) => {
    socket.to(message.roomCode).emit("new_message", message);
  });

  socket.on("leave_room", ({ roomCode, userId }) => {
    const room = rooms.get(roomCode);
    if (room) {
      room.users = room.users.filter(u => u.id !== userId);
      socket.leave(roomCode);
      userRooms.delete(socket.id);
      socket.to(roomCode).emit("user_left", { id: userId });
    }
  });

  socket.on("disconnect", () => {
    const code = userRooms.get(socket.id);
    const room = rooms.get(code);
    if (room) {
      room.users = room.users.filter(u => u.id !== socket.id);
      socket.to(code).emit("user_left", { id: socket.id });
      if (room.users.length === 0) rooms.delete(code);
    }
    userRooms.delete(socket.id);
    console.log("🔴 Disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
console.log("🌐 Binding to port:", PORT);
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
