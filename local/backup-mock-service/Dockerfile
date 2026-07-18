# Simple backup mock service
# This is a placeholder for the backup demo
FROM node:20-alpine

WORKDIR /app

# Create a simple Express server that mocks RDS backup
RUN npm init -y && \
    npm install express

# Create mock server
RUN echo 'const express = require("express"); \
const app = express(); \
app.get("/health", (req, res) => res.json({ status: "healthy" })); \
app.post("/backup", (req, res) => { \
  console.log("Mock backup triggered"); \
  res.json({ exportTaskId: "mock-" + Date.now() }); \
}); \
app.listen(3000, () => console.log("Backup Mock Service running on port 3000"));' > index.js

EXPOSE 3000

CMD ["node", "index.js"]
