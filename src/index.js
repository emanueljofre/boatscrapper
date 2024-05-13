const express = require("express");
const cors = require("cors");
const app = express();
const scrapeYatchWorld = require("./scrapers/yachtworld");
const scrapeSailboatData = require("./scrapers/sailboatdata");

/* -------------------------------------------------------------------------- */
/*                              CONFIG VARIABLES                              */
/* -------------------------------------------------------------------------- */

const PORT = process.env.PORT || 3001;
const scrappedData = [];

/* -------------------------------------------------------------------------- */
/*                                    MAIN                                    */
/* -------------------------------------------------------------------------- */

app.use(cors());

app.get("/", (req, res) => {
  res.send("Sailboat Price Comparison API");
});

app.get("/scrapeYachtworld", async (req, res) => {
  try {
    await scrapeYatchWorld();
    res.json(scrappedData);
  } catch (error) {
    console.log("test");
  }
});

app.get("/scrapeSailboatData", async (req, res) => {
  try {
    await scrapeSailboatData();
    res.json(scrappedData);
  } catch (error) {
    console.log("test");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
