// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const Race = require("./models/Race");
const User = require("./models/User");
const app = express();

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

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

// Middleware para autenticar token
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Middleware para verificar rol admin
function isAdmin(req, res, next) {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ error: "Admin access required" });
  }
}

// Register Endpoint
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    // Se ignora cualquier rol enviado y se deja por defecto "user"
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
      const payload = { username: user.username, role: user.role };
      const accessToken = jwt.sign(
        payload,
        process.env.ACCESS_TOKEN_SECRET
      );
      res.json({ accessToken, role: user.role });
    } else {
      res.send("Not Allowed");
    }
  } catch {
    res.status(500).send();
  }
});

// Endpoint para crear competición
app.post("/api/competitions", async (req, res) => {
  try {
    const { name } = req.body;
    const newRace = new Race({
      name,
      buoys: [],
      positions: {},
      startTmst: Date.now(),
      endTmst: null, // Competición en curso
      active: false  // Por defecto no activa
    });
    await newRace.save();
    res.status(201).json({ message: "Competition created", race: newRace });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para guardar regatas
app.post("/api/races", async (req, res) => {
  try {
    const { name, buoys, positions, startTmst, endTmst } = req.body;
    const newRace = new Race({
      name,
      buoys,
      positions,
      startTmst,
      endTmst,
      active: false
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

// NUEVOS ENDPOINTS PARA COMPETICIÓN EN DIRECTO

// GET active competition – cualquier usuario autenticado puede consultar
app.get("/api/active-competition", authenticateToken, async (req, res) => {
  try {
    const activeRace = await Race.findOne({ active: true, endTmst: null });
    if (!activeRace) {
      return res.status(404).json({ error: "No active competition found" });
    }
    res.json(activeRace);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT active competition – solo admin puede actualizar cuál competición en directo se muestra
app.put("/api/active-competition", authenticateToken, isAdmin, async (req, res) => {
  const { raceId } = req.body;
  if (!raceId) {
    return res.status(400).json({ error: "raceId is required" });
  }
  try {
    // Desactivar todas las competiciones en directo (que aún no han terminado)
    await Race.updateMany({ endTmst: null }, { active: false });
    // Activar la competición elegida
    const updatedRace = await Race.findByIdAndUpdate(raceId, { active: true }, { new: true });
    if (!updatedRace) {
      return res.status(404).json({ error: "Race not found" });
    }
    res.json({ message: "Active competition updated", race: updatedRace });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.io Logic (sin cambios en esta parte)
let connectedBoats = []; // Array de socket IDs de barcos
let usedColors = {}; // Mapping: socket.id -> color
let globalBuoys = []; // Boyas cargadas en memoria

io.on("connection", (socket) => {
  const role = socket.handshake.query.role;
  console.log(`🔌 New client connected: ${socket.id}, role: ${role}`);

  // Manejar evento "sendBuoys"
  socket.on("sendBuoys", (buoys) => {
    console.log("Server received buoys:", buoys);
    globalBuoys = buoys;
    io.emit("buoys", buoys); // Difundir a todos los clientes
  });

  // Conexiones de barcos
  if (role === "boat") {
    console.log("🔵 Connection identified as BOAT:", socket.id);

    // Asignar un color único
    const availableColors = ["red", "blue", "yellow", "green", "purple"];
    const color = availableColors.find((c) => !Object.values(usedColors).includes(c));
    if (!color) {
      socket.emit("assignBoatInfo", { error: "No colors available" });
      return;
    }
    usedColors[socket.id] = color;
    connectedBoats.push(socket.id);

    reassignBoatNames();

    // Escuchar actualizaciones de ubicación
    socket.on("sendLocation", async (data) => {
      console.log("📡 Location received:", data);
      
      // Almacenar el raceId en el socket para referencia posterior
      if (data.raceId) {
        socket.raceId = data.raceId;
      }

      // Si se incluye raceId y boatName, usamos $push para acumular posiciones
      if (data.raceId && data.boatName) {
        try {
          await Race.findByIdAndUpdate(
            data.raceId,
            {
              $push: {
                [`positions.${data.boatName}`]: {
                  a: data.latitude,
                  n: data.longitude,
                  t: data.timestamp || Date.now(),
                  s: data.speed || 0,
                  c: data.azimuth || 0,
                }
              }
            }
          );
        } catch (err) {
          console.error("Error updating race positions:", err);
        }
      }
      // Difundir actualización de ubicación
      const boatInfo = {
        id: socket.id,
        name: data.boatName || getBoatName(socket.id),
        color: usedColors[socket.id],
        ...data,
      };

      console.log("📡 Location received:", boatInfo);
      io.emit("updateLocation", boatInfo);
    });

    // Manejar evento "boatFinished"
    socket.on("boatFinished", (data) => {
      console.log(`🚩 Boat finished route: ${data.boatName}`);
      io.emit("boatFinished", data);
    });

    // Desconexión
    socket.on("disconnect", () => {
      console.log("🔴 BOAT disconnected:", socket.id);
      connectedBoats = connectedBoats.filter((id) => id !== socket.id);
      delete usedColors[socket.id];
      reassignBoatNames();

      // Si el socket tenía asignado un raceId, esperar un período de gracia para finalizar la competición
      if (socket.raceId) {
        const localRaceId = socket.raceId;
        // Esperar 30 segundos antes de chequear si quedan barcos conectados para ese raceId
        setTimeout(() => {
          let boatsInRace = [];
          io.sockets.sockets.forEach((s) => {
            if (s.handshake.query.role === "boat" && s.raceId === localRaceId) {
              boatsInRace.push(s.id);
            }
          });
          if (boatsInRace.length === 0) {
            Race.findByIdAndUpdate(localRaceId, { endTmst: Date.now() })
              .then(() => {
                console.log(`🏁 Race ${localRaceId} marked as finished.`);
              })
              .catch((err) => {
                console.error(`Error finishing race ${localRaceId}:`, err);
              });
          }
        }, 30000); // Período de gracia de 30 segundos
      }
    });
  } else {
    // Conexiones de viewer
    console.log("🟢 Connection identified as VIEWER:", socket.id);

    if (globalBuoys.length > 0) {
      socket.emit("buoys", globalBuoys);
    }

    socket.on("disconnect", () => {
      console.log("🟡 VIEWER disconnected:", socket.id);
    });
  }
});

// Reasignar nombres de barcos
function reassignBoatNames() {
  const baseNames = ["Boat 1", "Boat 2", "Boat 3", "Boat 4", "Boat 5"];
  connectedBoats.forEach((id, index) => {
    const name = baseNames[index];
    if (name) {
      io.to(id).emit("assignBoatInfo", { name, color: usedColors[id] });
      console.log(`📌 Assigned: ${id} -> ${name}`);
    }
  });
}

// Obtener nombre de barco por socket ID
function getBoatName(id) {
  const baseNames = ["Boat 1", "Boat 2", "Boat 3", "Boat 4", "Boat 5"];
  const index = connectedBoats.indexOf(id);
  return baseNames[index];
}

// Iniciar el servidor
const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
