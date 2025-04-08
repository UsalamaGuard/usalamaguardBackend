const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  image: String,
  type: String,
  location: String,
  status: String,
  severity: String,
});

module.exports = mongoose.model("Event", eventSchema);
