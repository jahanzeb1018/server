require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { Pool } = require("pg"); // PostgreSQL
const mongoose = require("mongoose"); // MongoDB
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json()); // Enable JSON body parsing

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// -------------------------------
// ✅ 1️⃣ Connect to MongoDB (User Auth)
// -------------------------------
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((error) => console.error("❌ MongoDB Connection Error:", error));

// -------------------------------
// ✅ 2️⃣ Define MongoDB User Schema
// -------------------------------
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// -------------------------------
// ✅ 3️⃣ Connect to PostgreSQL (Boat Tracking)
// -------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Ensure tables exist
const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS boats (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        color VARCHAR(50)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        boat_id INTEGER REFERENCES boats(id) ON DELETE CASCADE,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        azimuth DOUBLE PRECISION NOT NULL,
        speed DOUBLE PRECISION NOT NULL,
        pitch DOUBLE PRECISION,
        roll DOUBLE PRECISION,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ PostgreSQL Tables Created Successfully");
  } catch (error) {
    console.error("❌ PostgreSQL Table Creation Error:", error);
  }
};

createTables();

// -------------------------------
// ✅ 4️⃣ Authentication Routes (MongoDB)
// -------------------------------

// 📝 User Registration
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already registered" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// 🔑 User Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid email or password" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// 🔒 Middleware for Auth-Protected Routes
const authMiddleware = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// 🔐 Protected Route (Example: Profile)
app.get("/profile", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId).select("-password");
  res.json(user);
});

// -------------------------------
// ✅ 5️⃣ Socket.io (Boat Tracking)
// -------------------------------
let connectedBoats = [];
let usedColors = {};
let globalBuoys = [];

io.on("connection", (socket) => {
  const role = socket.handshake.query.role;
  console.log(`🔌 New Connection: ${socket.id}, Role: ${role}`);

  // 🔵 Handle Boat Tracking
  if (role === "boat") {
    const color = ["red", "blue", "yellow", "green", "purple"].find(
      (c) => !Object.values(usedColors).includes(c)
    );

    if (!color) {
      socket.emit("assignBoatInfo", { error: "No colors available" });
      return;
    }

    usedColors[socket.id] = color;
    connectedBoats.push(socket.id);
    reassignBoatNames();

    socket.on("sendLocation", (data) => {
      const boatInfo = {
        id: socket.id,
        name: getBoatName(socket.id),
        color: usedColors[socket.id],
        ...data,
      };

      saveLocationToDb(boatInfo);
      io.emit("updateLocation", boatInfo);
    });

    socket.on("boatFinished", (data) => {
      console.log(`🚩 Boat Finished: ${data.name}`);
      io.emit("boatFinished", data);
    });

    socket.on("disconnect", () => {
      console.log("🔴 Boat Disconnected:", socket.id);
      connectedBoats = connectedBoats.filter((id) => id !== socket.id);
      delete usedColors[socket.id];
      reassignBoatNames();
    });
  } else {
    console.log("🟢 Viewer Connected:", socket.id);

    if (globalBuoys.length > 0) {
      socket.emit("buoys", globalBuoys);
    }

    socket.on("disconnect", () => {
      console.log("🟡 Viewer Disconnected:", socket.id);
    });
  }
});

function reassignBoatNames() {
  connectedBoats.forEach((id, index) => {
    const name = `Boat ${index + 1}`;
    io.to(id).emit("assignBoatInfo", { name, color: usedColors[id] });
  });
}

function getBoatName(id) {
  return `Boat ${connectedBoats.indexOf(id) + 1}`;
}

const saveLocationToDb = async (boatInfo) => {
  try {
    const result = await pool.query("SELECT id FROM boats WHERE name = $1", [boatInfo.name]);

    let boatId = result.rows.length
      ? result.rows[0].id
      : (await pool.query("INSERT INTO boats (name, color) VALUES ($1, $2) RETURNING id", [
          boatInfo.name,
          boatInfo.color,
        ])).rows[0].id;

    await pool.query(
      "INSERT INTO locations (boat_id, latitude, longitude, azimuth, speed, pitch, roll) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [boatId, boatInfo.latitude, boatInfo.longitude, boatInfo.azimuth, boatInfo.speed, boatInfo.pitch, boatInfo.roll]
    );

    console.log(`📍 Saved Boat Location: ${boatInfo.name}`);
  } catch (error) {
    console.error("❌ PostgreSQL Error:", error);
  }
};

// -------------------------------
// ✅ Start Server on Railway
// -------------------------------
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
