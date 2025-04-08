const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// --- CORS SETUP ---
const allowedOrigins = [
  "http://localhost:3000",          
  "https://usalamaguardai.vercel.app",
  "https://usalamaguardbackend.onrender.com"
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

// --- MONGOOSE CONNECTION ---
console.log("Attempting to connect to MongoDB:", process.env.MONGODB_URI.replace(/:([^:@]+)@/, ":****@"));

let firstConnect = true;

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  family: 4,
}).catch((err) => {
  console.error("MongoDB initial connection error:", err);
});

mongoose.connection.on("connected", () => {
  if (firstConnect) {
    console.log("✅ MongoDB connected successfully");
    firstConnect = false;
  } else {
    console.log("🔄 MongoDB reconnected");
  }
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ Mongoose disconnected - attempting to reconnect...");
  setTimeout(() => {
    mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4,
    }).catch((err) => {
      console.error("Reconnection attempt failed:", err);
    });
  }, 5000);
});

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  notificationEmail: { type: String, required: true },
  firstName: { type: String },
  cameraLocation: { type: String },
});
const User = mongoose.model("User", userSchema);

const eventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  timestamp: String,
  image: String,
  type: String,
  location: String,
  status: String,
  severity: String,
});
eventSchema.index({ timestamp: -1 });
const Event = mongoose.model("Event", eventSchema);

// --- MIDDLEWARE ---
const checkDbConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "Database not connected" });
  }
  next();
};

// --- ROUTES ---
// Signup
// Signup
app.post("/api/auth/signup", checkDbConnection, async (req, res) => {
  try {
    const { email, password, notificationEmail, firstName, cameraLocation } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already exists" });

    if (!cameraLocation) {
      return res.status(400).json({ error: "Camera location is required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      email, 
      password: hashedPassword, 
      notificationEmail, 
      firstName, 
      cameraLocation 
    });
    await user.save();
    console.log(`Signup successful for ${email}, user ID: ${user._id}, cameraLocation: ${cameraLocation}`);
    res.status(201).json({ message: "User created", id: user._id });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// Fetch camera location
app.get("/api/users/:id/camera-location", checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("cameraLocation");
    if (!user) return res.status(404).json({ error: "User not found" });
    console.log(`Camera location fetched for user ${id}: ${user.cameraLocation || "Not Set"}`);
    res.json({ cameraLocation: user.cameraLocation || "Not Set" });
  } catch (err) {
    console.error("Error fetching camera location:", err);
    res.status(500).json({ error: "Failed to fetch camera location" });
  }
});

// Login
app.post("/api/auth/login", checkDbConnection, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      console.log(`Login failed for ${email}: Invalid credentials`);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    console.log(`Login successful for ${email}, user ID: ${user._id}`);
    res.json({ id: user._id, email: user.email, firstName: user.firstName });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Fetch events
app.get("/api/events", checkDbConnection, async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(401).json({ error: "User not authenticated" });
    const events = await Event.find({ userId }).sort({ timestamp: -1 });
    console.log(`Events fetched for user ${userId}: ${events.length}`);
    res.json(events);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// Create event
app.post("/api/events", checkDbConnection, async (req, res) => {
  try {
    console.log("POST /api/events received");
    const { userId, timestamp, image, type, location, status, severity } = req.body;
    if (!userId) return res.status(401).json({ error: "User not authenticated" });

    console.log("Image data received:", {
      size: image ? `${(image.length / 1024).toFixed(2)} KB` : "No image",
      preview: image ? image.slice(0, 50) + "..." : "N/A",
    });

    const newEvent = new Event({ userId, timestamp, image, type, location, status, severity });
    await newEvent.save();
    console.log("Event saved:", { _id: newEvent._id, userId: newEvent.userId, timestamp: newEvent.timestamp });
    io.emit(`new_event_${userId}`, newEvent);
    res.status(201).json(newEvent);
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// Update event status
app.patch("/api/events/:id", checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!["Active", "Resolved", "Dismissed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const updatedEvent = await Event.findByIdAndUpdate(id, { status }, { new: true });
    if (!updatedEvent) return res.status(404).json({ error: "Event not found" });

    console.log("Event updated:", { _id: updatedEvent._id, status: updatedEvent.status });
    io.emit(`event_updated_${updatedEvent.userId}`, updatedEvent);
    res.json(updatedEvent);
  } catch (err) {
    console.error("Error updating event:", err);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// --- SOCKET.IO SETUP ---
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

io.on("connection", (socket) => {
  console.log("🔌 New client connected");
  socket.on("disconnect", () => console.log("❌ Client disconnected"));
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
