const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
module.exports = function (req, res, next) {
  try {
    const token = req.header("x-token");
    if (!token) {
      return res.status(400).send("token not found");
    }
    let decode = jwt.verify(token, process.env.SECRETKEY);
    req.user = decode.user;
    next();
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "server error" });
  }
};
