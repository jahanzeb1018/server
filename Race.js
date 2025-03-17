// models/Race.js
const mongoose = require("mongoose");

const RaceSchema = new mongoose.Schema({
  name: String,      // Nombre identificatorio de la carrera
  buoys: Array,      // Array de boyas (cada elemento con lat, lng, name, etc.)
  positions: Object, // Object con { "BoatName": [ {a,n,t,s,c...}, ... ], ... }
  startTmst: Number, // Época de inicio
  endTmst: Number,   // Época de fin
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Race", RaceSchema);
