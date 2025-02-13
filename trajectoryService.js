const fs = require("fs");
const path = require("path");
const io = require("socket.io-client");

const socket = io("https://server-production-c33c.up.railway.app/");

const jsonFilePath = path.join(__dirname, "data", "boat_positions.json");

// 📌 Lista de colores disponibles
const availableColors = ["red", "blue", "yellow", "green", "purple", "orange", "cyan", "pink"];
let boatColors = {}; // Mapeo de barcos: id -> color

const loadJsonData = () => {
  try {
    const rawData = fs.readFileSync(jsonFilePath);
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error cargando JSON:", error);
    return null;
  }
};

const startBoatSimulation = () => {
  const data = loadJsonData();
  if (!data || !data.positions) return console.error("No hay datos disponibles.");

  Object.entries(data.positions).forEach(([boatName, positions], index) => {
    let color = availableColors[index % availableColors.length]; // Asignar color único
    boatColors[boatName] = color;

    let indexPos = 0;
    const sendNextPosition = () => {
      if (indexPos >= positions.length) return;

      const position = positions[indexPos];
      const boatInfo = {
        id: boatName,
        name: boatName,
        color: boatColors[boatName],
        latitude: position.a,
        longitude: position.n,
        speed: position.s,
        azimuth: position.c
      };

      console.log(`Enviando datos de ${boatName}:`, boatInfo);
      socket.emit("sendLocation", boatInfo);

      indexPos++;
      setTimeout(sendNextPosition, 2000);
    };

    sendNextPosition();
  });
};

startBoatSimulation();
