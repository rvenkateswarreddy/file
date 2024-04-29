const mongoose = require("mongoose");

// Define the schema for registration details
const registerDetailsSchema = new mongoose.Schema(
  {
    usertype: { type: String, required: true },
    secretkey: { type: String, required: false }, // Only required for admin
    fullname: { type: String, required: true }, // Changed to required
    email: { type: String, required: true, unique: true }, // Email should be unique
    mobile: { type: String, required: true },
    password: { type: String, required: true },
    confirmpassword: { type: String, required: true }, // Ensure password match
  },
  {
    timestamps: true, // Include createdAt and updatedAt timestamps
  }
);

// Fix typo in the timestamps definition and add model creation
const RegisterDetails = mongoose.model(
  "RegisterDetails",
  registerDetailsSchema
);

module.exports = RegisterDetails;
