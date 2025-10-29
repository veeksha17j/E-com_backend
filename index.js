const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const serverless = require("serverless-http");

// Load .env in development if available
try {
  require("dotenv").config();
} catch (e) {}

const app = express();
app.use(express.json());
app.use(cors());

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://greatstackdev:greatstackdevv@cluster0.f5j1s5q.mongodb.net/e-commerce";
const JWT_SECRET = process.env.JWT_SECRET || "secret_ecom";

// Reuse mongoose connection across serverless invocations
async function connectToMongo() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!global.__mongoosePromise) {
    global.__mongoosePromise = mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }
  return global.__mongoosePromise;
}
connectToMongo()
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Multer (memory storage for Vercel)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper to wrap async handlers
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Root
app.get(
  "/",
  asyncHandler(async (req, res) => {
    res.send("🚀 Express app is running on Vercel!");
  })
);

// Upload endpoint
app.post(
  "/upload",
  upload.single("product"),
  asyncHandler(async (req, res) => {
    if (!req.file)
      return res.status(400).json({ success: 0, error: "No file uploaded" });
    res.json({
      success: 1,
      message: "File received (not stored on Vercel)",
    });
  })
);

// Schemas & Models
const productSchema = new mongoose.Schema({
  id: Number,
  name: String,
  image: String,
  category: String,
  new_price: Number,
  old_price: Number,
  date: { type: Date, default: Date.now },
  available: { type: Boolean, default: true },
});
const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  cartData: Object,
  date: { type: Date, default: Date.now },
});
const Users = mongoose.models.Users || mongoose.model("Users", userSchema);

// Products routes
app.post(
  "/addproduct",
  asyncHandler(async (req, res) => {
    const { name, image, category, new_price, old_price } = req.body;
    if (!name)
      return res.status(400).json({ success: false, error: "Name required" });

    const last = await Product.findOne({}).sort({ id: -1 }).limit(1).exec();
    const id = last ? last.id + 1 : 1;

    const product = new Product({
      id,
      name,
      image,
      category,
      new_price,
      old_price,
    });
    await product.save();
    res.json({ success: true, name });
  })
);

app.post(
  "/removeproduct",
  asyncHandler(async (req, res) => {
    await Product.findOneAndDelete({ id: req.body.id });
    res.json({ success: true });
  })
);

app.get(
  "/allproducts",
  asyncHandler(async (req, res) => {
    const products = await Product.find({});
    res.json(products);
  })
);

// Auth routes
app.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ success: false, error: "Missing fields" });

    const existing = await Users.findOne({ email });
    if (existing)
      return res
        .status(400)
        .json({ success: false, errors: "Email already exists" });

    const cart = {};
    for (let i = 0; i < 300; i++) cart[i] = 0;

    const user = new Users({ name: username, email, password, cartData: cart });
    await user.save();

    const data = { user: { id: user._id } };
    const token = jwt.sign(data, JWT_SECRET);
    res.json({ success: true, token });
  })
);

app.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, error: "Missing fields" });

    const user = await Users.findOne({ email });
    if (!user)
      return res.status(400).json({ success: false, error: "Wrong email" });

    const passCompare = password === user.password;
    if (!passCompare)
      return res.status(400).json({ success: false, error: "Wrong password" });

    const data = { user: { id: user._id } };
    const token = jwt.sign(data, JWT_SECRET);
    res.json({ success: true, token });
  })
);

// Auth middleware
const fetchUser = asyncHandler(async (req, res, next) => {
  const token = req.header("auth-token");
  if (!token) return res.status(401).send({ errors: "Missing token" });

  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).send({ errors: "Invalid token" });
  }
});

// Cart routes
app.post(
  "/addtocart",
  fetchUser,
  asyncHandler(async (req, res) => {
    const { itemId } = req.body;
    if (typeof itemId === "undefined")
      return res.status(400).json({ error: "itemId required" });

    const userData = await Users.findById(req.user.id);
    if (!userData) return res.status(404).json({ error: "User not found" });

    userData.cartData[itemId] = (userData.cartData[itemId] || 0) + 1;
    await userData.save();
    res.json({ success: true, message: "Added" });
  })
);

app.post(
  "/removefromcart",
  fetchUser,
  asyncHandler(async (req, res) => {
    const { itemId } = req.body;
    if (typeof itemId === "undefined")
      return res.status(400).json({ error: "itemId required" });

    const userData = await Users.findById(req.user.id);
    if (!userData) return res.status(404).json({ error: "User not found" });

    if ((userData.cartData[itemId] || 0) > 0) userData.cartData[itemId] -= 1;
    await userData.save();
    res.json({ success: true, message: "Removed" });
  })
);

app.post(
  "/getcart",
  fetchUser,
  asyncHandler(async (req, res) => {
    const userData = await Users.findById(req.user.id);
    if (!userData) return res.status(404).json({ error: "User not found" });
    res.json(userData.cartData);
  })
);

// Collections
app.get(
  "/newcollections",
  asyncHandler(async (req, res) => {
    const products = await Product.find({});
    res.json(products.slice(-8));
  })
);

app.get(
  "/popularinwomen",
  asyncHandler(async (req, res) => {
    const products = await Product.find({ category: "women" });
    res.json(products.slice(0, 4));
  })
);

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "production" ? undefined : err?.message,
  });
});

// Export serverless handler for Vercel
module.exports = serverless(app);
