// seedRace.js
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const Race = require("./models/Race");

// Ruta al JSON local
const filePath = path.join(__dirname, "boat_positions.json");

async function main() {
  try {
    // 1. Conectar a Mongo
    await mongoose.connect(process.env.MONGO_URI, {});
    console.log("✅ Connected to MongoDB (seed)");

    // 2. Leer el JSON
    const rawData = fs.readFileSync(filePath, "utf8");
    const jsonData = JSON.parse(rawData);

    // 3. Opcional: verifica si ya existe una regata con cierto nombre
    const existing = await Race.findOne({ name: "Regata Auto3" });
    if (existing) {
      console.log("⚠️ A race named 'Regata Auto' already exists. Skipping seed.");
      return;
    }

    // 4. Crear el documento Race con los datos del JSON
    const newRace = new Race({
      name: "Regata Auto3",
      buoys: jsonData.buoys,
      positions: jsonData.positions,
      startTmst: jsonData.startTmst,
      endTmst: jsonData.endTmst
    });

    // 5. Guardar en Mongo
    await newRace.save();
    console.log("✅ Race inserted:", newRace._id);
  } catch (err) {
    console.error("❌ Error in seedRace:", err);
  } finally {
    // 6. Cerrar conexión
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB (seed)");
  }
}

main();
