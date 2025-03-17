const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const Race = require("./models/Race");
const app = express();

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());


const server = http.createServer(app);
const io = socketIo(server, {
  cors: corsOptions,
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Register Endpoint
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
    res.status(201).send("User registered");
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Login Endpoint
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user == null) {
    return res.status(400).send("Cannot find user");
  }
  try {
    if (await bcrypt.compare(password, user.password)) {
      const accessToken = jwt.sign(
        { username: user.username },
        process.env.ACCESS_TOKEN_SECRET
      );
      res.json({ accessToken });
    } else {
      res.send("Not Allowed");
    }
  } catch {
    res.status(500).send();
  }
});

// Socket.io Logic
let connectedBoats = []; // Array of socket IDs that are "boats"
let usedColors = {}; // Mapping: socket.id -> color
let globalBuoys = []; // Buoys loaded in memory

io.on("connection", (socket) => {
  const role = socket.handshake.query.role;
  console.log(`🔌 New client connected: ${socket.id}, role: ${role}`);

  // Handle "sendBuoys" event
  socket.on("sendBuoys", (buoys) => {
    console.log("Server received buoys:", buoys);
    globalBuoys = buoys;
    io.emit("buoys", buoys); // Broadcast to all clients
  });

  // Handle "boat" connections
  if (role === "boat") {
    console.log("🔵 Connection identified as BOAT:", socket.id);

    // Assign a unique color
    const color = availableColors.find(
      (c) => !Object.values(usedColors).includes(c)
    );
    if (!color) {
      socket.emit("assignBoatInfo", { error: "No colors available" });
      return;
    }
    usedColors[socket.id] = color;
    connectedBoats.push(socket.id);

    reassignBoatNames();

    // Listen for boat location updates
    socket.on("sendLocation", (data) => {
      const boatInfo = {
        id: socket.id,
        name: getBoatName(socket.id),
        color: usedColors[socket.id],
        ...data,
      };

      console.log("📡 Location received:", boatInfo);
      io.emit("updateLocation", boatInfo); // Broadcast to all clients
    });

    // Handle "boatFinished" event
    socket.on("boatFinished", (data) => {
      console.log(`🚩 Boat finished route: ${data.name}`);
      io.emit("boatFinished", data);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("🔴 BOAT disconnected:", socket.id);
      connectedBoats = connectedBoats.filter((id) => id !== socket.id);
      delete usedColors[socket.id];
      reassignBoatNames();
    });
  } else {
    // Handle "viewer" connections
    console.log("🟢 Connection identified as VIEWER:", socket.id);

    // Send existing buoys to the viewer
    if (globalBuoys.length > 0) {
      socket.emit("buoys", globalBuoys);
    }

    socket.on("disconnect", () => {
      console.log("🟡 VIEWER disconnected:", socket.id);
    });
  }
});

// Reassign boat names in order
function reassignBoatNames() {
  connectedBoats.forEach((id, index) => {
    const name = baseNames[index];
    if (name) {
      io.to(id).emit("assignBoatInfo", { name, color: usedColors[id] });
      console.log(`📌 Assigned: ${id} -> ${name}`);
    }
  });
}

// Get boat name by socket ID
function getBoatName(id) {
  const index = connectedBoats.indexOf(id);
  return baseNames[index];
}

// Base names and colors
const baseNames = ["Boat 1", "Boat 2", "Boat 3", "Boat 4", "Boat 5"];
const availableColors = ["red", "blue", "yellow", "green", "purple"];


// Guardar una regata en la BD (desde un JSON, por ejemplo)
app.post("/api/races", async (req, res) => {
  try {
    // req.body contendrá algo similar a lo que tenías en boat_positions.json
    // Ej: { name, buoys, positions, startTmst, endTmst }
    const { name, buoys, positions, startTmst, endTmst } = req.body;

    const newRace = new Race({
      name,
      buoys,
      positions,
      startTmst,
      endTmst
    });

    await newRace.save();
    res.status(201).json({ message: "Race saved", race: newRace });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar todas las regatas
app.get("/api/races", async (req, res) => {
  try {
    const races = await Race.find().sort({ createdAt: -1 });
    res.json(races);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener una regata por ID
app.get("/api/races/:id", async (req, res) => {
  try {
    const race = await Race.findById(req.params.id);
    if (!race) {
      return res.status(404).json({ error: "Race not found" });
    }
    res.json(race);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});