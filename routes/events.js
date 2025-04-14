const express = require("express");
const router = express.Router();
const Event = require("../models/Event");


router.get("/", async (req, res) => {
  try {
    const events = await Event.find().sort({ timestamp: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post("/", async (req, res) => {
  try {
    const newEvent = new Event(req.body);
    const saved = await newEvent.save();


    req.io.emit("new_event", saved);

    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
