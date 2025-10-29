const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

// 🧩 MongoDB connection (use env variable in production)
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://greatstackdev:greatstackdevv@cluster0.f5j1s5q.mongodb.net/e-commerce";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ⚡ Root route
app.get("/", (req, res) => {
  res.send("🚀 Express app is running on Vercel!");
});

// ⚙️ Multer setup (note: local file uploads don’t persist on Vercel)
const storage = multer.memoryStorage(); // use memoryStorage on Vercel
const upload = multer({ storage });

// Example image upload endpoint
app.post("/upload", upload.single("product"), (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: 0, error: "No file uploaded" });
  res.json({
    success: 1,
    message: "File received (not stored on Vercel)",
  });
});

// 🛍️ Product schema
const Product = mongoose.model("Product", {
  id: Number,
  name: String,
  image: String,
  category: String,
  new_price: Number,
  old_price: Number,
  date: { type: Date, default: Date.now },
  available: { type: Boolean, default: true },
});

// Add product
app.post("/addproduct", async (req, res) => {
  let products = await Product.find({});
  let id = products.length > 0 ? products[products.length - 1].id + 1 : 1;

  const product = new Product({
    id,
    name: req.body.name,
    image: req.body.image,
    category: req.body.category,
    new_price: req.body.new_price,
    old_price: req.body.old_price,
  });

  await product.save();
  res.json({ success: true, name: req.body.name });
});

// Remove product
app.post("/removeproduct", async (req, res) => {
  await Product.findOneAndDelete({ id: req.body.id });
  res.json({ success: true });
});

// Get all products
app.get("/allproducts", async (req, res) => {
  let products = await Product.find({});
  res.send(products);
});

// 👤 User schema
const Users = mongoose.model("Users", {
  name: String,
  email: { type: String, unique: true },
  password: String,
  cartData: Object,
  date: { type: Date, default: Date.now },
});

// Register
app.post("/signup", async (req, res) => {
  let check = await Users.findOne({ email: req.body.email });
  if (check)
    return res
      .status(400)
      .json({ success: false, errors: "Email already exists" });

  let cart = {};
  for (let i = 0; i < 300; i++) cart[i] = 0;

  const user = new Users({
    name: req.body.username,
    email: req.body.email,
    password: req.body.password,
    cartData: cart,
  });

  await user.save();

  const data = { user: { id: user.id } };
  const token = jwt.sign(data, "secret_ecom");
  res.json({ success: true, token });
});

// Login
app.post("/login", async (req, res) => {
  let user = await Users.findOne({ email: req.body.email });
  if (!user) return res.json({ success: false, error: "Wrong email" });

  const passCompare = req.body.password === user.password;
  if (!passCompare)
    return res.json({ success: false, error: "Wrong password" });

  const data = { user: { id: user.id } };
  const token = jwt.sign(data, "secret_ecom");
  res.json({ success: true, token });
});

// Middleware to check token
const fetchUser = async (req, res, next) => {
  const token = req.header("auth-token");
  if (!token) return res.status(401).send({ errors: "Missing token" });

  try {
    const data = jwt.verify(token, "secret_ecom");
    req.user = data.user;
    next();
  } catch (error) {
    res.status(401).send({ errors: "Invalid token" });
  }
};

// Cart routes
app.post("/addtocart", fetchUser, async (req, res) => {
  let userData = await Users.findById(req.user.id);
  userData.cartData[req.body.itemId] += 1;
  await userData.save();
  res.send("Added");
});

app.post("/removefromcart", fetchUser, async (req, res) => {
  let userData = await Users.findById(req.user.id);
  if (userData.cartData[req.body.itemId] > 0)
    userData.cartData[req.body.itemId] -= 1;
  await userData.save();
  res.send("Removed");
});

app.post("/getcart", fetchUser, async (req, res) => {
  let userData = await Users.findById(req.user.id);
  res.json(userData.cartData);
});

// Collections
app.get("/newcollections", async (req, res) => {
  let products = await Product.find({});
  res.send(products.slice(-8));
});

app.get("/popularinwomen", async (req, res) => {
  let products = await Product.find({ category: "women" });
  res.send(products.slice(0, 4));
});

// 🧠 Export the app (no app.listen!)
module.exports = app;
