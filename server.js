const express = require("express");
const bodyParser = require("body-parser"); // Fixed typo: "body-parser"
const cors = require("cors");
require("dotenv").config();
const mongoose = require("mongoose"); // 
const authRoutes = require('./routes/auth');

const app = express();

// Middleware
app.use(cors({
  origin: 'https://usalamaguardai.vercel.app/', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})); // Enable CORS for frontend requests
app.use(bodyParser.json()); // Parse JSON bodies
app.use(bodyParser.urlencoded({ extended: true })); // Parse URL-encoded bodies (optional)

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("Connection to MongoDB made successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Port Configuration
const port = process.env.PORT || 3000; // Fallback to 3000 if PORT isn't set in .env

app.use('/auth', authRoutes);
// Start Server
app.listen(port, () => console.log(`Server running on port ${port}`));






