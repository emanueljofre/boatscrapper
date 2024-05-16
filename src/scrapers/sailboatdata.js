const mongoose = require("mongoose");
const puppeteer = require("puppeteer");
const winston = require("winston");

/* -------------------------------------------------------------------------- */
/*                                  LOGGER                                    */
/* -------------------------------------------------------------------------- */

const logger = winston.createLogger({
  level: "debug", // Set to debug to ensure all levels are logged
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      ({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Apply colorization to console logs
        winston.format.printf(
          ({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`
        )
      ),
    }), // Console transport
    new winston.transports.File({
      filename: `sbd_scraping_${new Date().toISOString().split("T")[0]}.log`,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`
        )
      ),
    }), // Console transport for exceptions
    new winston.transports.File({
      filename: `sbd_exception_${new Date().toISOString().split("T")[0]}.log`,
    }),
  ],
});

/* -------------------------------------------------------------------------- */
/*                              GLOBAL VARIABLES                              */
/* -------------------------------------------------------------------------- */

const baseURL = "https://sailboatdata.com";
const numberOfPages = 181;
const visitedURLs = new Set();
const pendingURLs = new Set();

/* -------------------------------------------------------------------------- */
/*                                  DATABASE                                  */
/* -------------------------------------------------------------------------- */

// Connection URI
const uri = "mongodb://localhost:27017/boatData";

// Connect to MongoDB
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on("error", (error) => logger.error(`Connection error: ${error.message}`));
db.once("open", () => logger.info("Connected to MongoDB"));

const sailboatSchema = new mongoose.Schema({
  url: String,
  model: String,
  hull_type: String,
  rigging_type: String,
  loa: { ft: Number, m: Number },
  lwl: { ft: Number, m: Number },
  sail_area: { ft2: Number, m2: Number },
  beam: { ft: Number, m: Number },
  displacement: { lb: Number, kg: Number },
  ballast: { lb: Number, kg: Number },
  max_draft: { ft: Number, m: Number },
  construction: String,
  ballast_type: String,
  first_built: Date,
  built_number: Number,
  designer: String,
  sail_area_displacement: Number,
  ballast_displacement: Number,
  displacement_length: Number,
  comfort_ratio: Number,
  capsize_ratio: Number,
  s_number: Number,
  hull_speed: Number,
  pound_inch_immersion: Number,
  i: { ft: Number, m: Number },
  j: { ft: Number, m: Number },
  p: { ft: Number, m: Number },
  e: { ft: Number, m: Number },
  spl_tps: { ft: Number, m: Number },
  isp: { ft: Number, m: Number },
  sail_area_fore: { ft2: Number, m2: Number },
  sail_area_main: { ft2: Number, m2: Number },
  sail_area_total: { ft2: Number, m2: Number },
  sail_area_displacement_calc: Number,
  forestay_length: { ft: Number, m: Number },
  designers: String,
  builders: String,
  association: String,
  products: String,
});

const Sailboat = mongoose.model("Sailboat", sailboatSchema);

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

const randomDelay = (min, max) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min))
  );

const fetchPage = async (url, browser) => {
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    if (visitedURLs.has(url)) {
      logger.info(`URL already visited: ${url}`);
      await page.close();
      return null;
    }

    visitedURLs.add(url);
    logger.info(`Scraping ${url}`);
    return page;
  } catch (error) {
    logger.error(`Error fetching page: ${error.message}`);
    return null;
  }
};

const extractBoatData = async (page) => {
  try {
    const boat = await page.evaluate(() => {
      const model = document.querySelector("h1")?.innerText.trim() || "";

      const data = {};
      document.querySelectorAll("tr").forEach((tr) => {
        const [key, value] = Array.from(tr.querySelectorAll("td")).map((td) =>
          td.textContent.trim()
        );
        if (key && value) data[key.replace(":", "")] = value;
      });

      return { model, data };
    });

    return boat;
  } catch (error) {
    logger.error(`Error extracting boat data: ${error.message}`);
    return {};
  }
};

const parseMeasurement = (str, pos) => {
  try {
    return parseFloat(
      str.split("/")[pos].trim().split(" ")[0].replace(",", "")
    );
  } catch {
    return null;
  }
};

const removeEmptyValues = (obj) => {
  const isEmpty = (value) => {
    if (value === null || value === undefined || value === "" || value === -1) {
      return true;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      // Recursively remove empty values from nested objects
      const cleanedObject = removeEmptyValues(value);
      return Object.keys(cleanedObject).length === 0;
    }
    return false;
  };

  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => !isEmpty(v))
  );
};

const buildBoatData = (boat, url) => ({
  url,
  model: boat.model,
  hull_type: boat.data["Hull Type"] || null,
  rigging_type: boat.data["Rigging Type"] || null,
  loa: {
    ft: parseMeasurement(boat.data["LOA"], 0),
    m: parseMeasurement(boat.data["LOA"], 1),
  },
  lwl: {
    ft: parseMeasurement(boat.data["LWL"], 0),
    m: parseMeasurement(boat.data["LWL"], 1),
  },
  sail_area: {
    ft2: parseMeasurement(boat.data["S.A. (reported)"], 0),
    m2: parseMeasurement(boat.data["S.A. (reported)"], 1),
  },
  beam: {
    ft: parseMeasurement(boat.data["Beam"], 0),
    m: parseMeasurement(boat.data["Beam"], 1),
  },
  displacement: {
    lb: parseMeasurement(boat.data["Displacement"], 0),
    kg: parseMeasurement(boat.data["Displacement"], 1),
  },
  ballast: {
    lb: parseMeasurement(boat.data["Ballast"], 0),
    kg: parseMeasurement(boat.data["Ballast"], 1),
  },
  max_draft: {
    ft: parseMeasurement(boat.data["Max Draft"], 0),
    m: parseMeasurement(boat.data["Max Draft"], 1),
  },
  construction: boat.data["Construction"] || null,
  ballast_type: boat.data["Ballast Type"] || null,
  first_built: boat.data["First Built"]
    ? new Date(boat.data["First Built"])
    : null,
  built_number: parseInt(boat.data["# Built"]) || null,
  designer: boat.data["Designer"] || null,
  sail_area_displacement: parseFloat(boat.data["S.A. / Displ."]) || null,
  ballast_displacement: parseFloat(boat.data["Bal. / Displ."]) || null,
  displacement_length: parseFloat(boat.data["Disp / Len:"]) || null,
  comfort_ratio: parseInt(boat.data["Comfort Ratio"]) || null,
  capsize_ratio: parseFloat(boat.data["Capsize Screening Formula"]) || null,
  s_number: parseFloat(boat.data["S#"]) || null,
  hull_speed: parseMeasurement(boat.data["Hull Speed"], 0),
  pound_inch_immersion: parseMeasurement(boat.data["Pounds/Inch Immersion"], 0),
  i: {
    ft: parseMeasurement(boat.data["I"], 0),
    m: parseMeasurement(boat.data["I"], 1),
  },
  j: {
    ft: parseMeasurement(boat.data["J"], 0),
    m: parseMeasurement(boat.data["J"], 1),
  },
  p: {
    ft: parseMeasurement(boat.data["P"], 0),
    m: parseMeasurement(boat.data["P"], 1),
  },
  e: {
    ft: parseMeasurement(boat.data["E"], 0),
    m: parseMeasurement(boat.data["E"], 1),
  },
  spl_tps: {
    ft: parseMeasurement(boat.data["SPL/TPS"], 0),
    m: parseMeasurement(boat.data["SPL/TPS"], 1),
  },
  isp: {
    ft: parseMeasurement(boat.data["ISP"], 0),
    m: parseMeasurement(boat.data["ISP"], 1),
  },
  sail_area_fore: {
    ft2: parseMeasurement(boat.data["S.A. Fore"], 0),
    m2: parseMeasurement(boat.data["S.A. Fore"], 1),
  },
  sail_area_main: {
    ft2: parseMeasurement(boat.data["S.A. Main"], 0),
    m2: parseMeasurement(boat.data["S.A. Main"], 1),
  },
  sail_area_total: {
    ft2: parseMeasurement(
      boat.data["S.A. Total (100% Fore + Main Triangles)"],
      0
    ),
    m2: parseMeasurement(
      boat.data["S.A. Total (100% Fore + Main Triangles)"],
      1
    ),
  },
  sail_area_displacement_calc: parseMeasurement(
    boat.data["S.A./Displ. (calc.)"],
    0
  ),
  forestay_length: {
    ft: parseMeasurement(boat.data["Est. Forestay Length"], 0),
    m: parseMeasurement(boat.data["Est. Forestay Length"], 1),
  },
  designers: boat.data["Designers"] || null,
  builders: boat.data["Builders"] || null,
  association: boat.data["Associations"] || null,
  products: boat.data["Products"] || null,
});

const saveBoat = async (boat, url) => {
  try {
    const boatData = removeEmptyValues(buildBoatData(boat, url));
    const regex = new RegExp(boat.model, "i"); // Create a case-insensitive regular expression for the model name

    const existingBoat = await Sailboat.findOne({ model: { $regex: regex } });

    const deepEqual = (obj1, obj2) => {
      if (obj1 === obj2) return true;
      if (
        typeof obj1 !== "object" ||
        typeof obj2 !== "object" ||
        obj1 === null ||
        obj2 === null
      )
        return false;
      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);
      if (keys1.length !== keys2.length) return false;
      for (let key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key]))
          return false;
      }
      return true;
    };

    if (existingBoat) {
      const differences = Object.keys(boatData).filter((key) => {
        if (typeof boatData[key] === "object" && boatData[key] !== null) {
          return !deepEqual(boatData[key], existingBoat[key]);
        }
        return boatData[key] !== existingBoat[key];
      });

      const keysToUnset = Object.keys(existingBoat.toObject()).filter(
        (key) => !(key in boatData) && key !== "_id" && key !== "__v"
      );

      if (differences.length > 0 || keysToUnset.length > 0) {
        const updateObject = { $set: boatData };
        if (keysToUnset.length > 0) {
          updateObject.$unset = keysToUnset.reduce((obj, key) => {
            obj[key] = 1; // Set to 1 to indicate the key should be removed
            return obj;
          }, {});
        }

        await Sailboat.updateOne({ model: { $regex: regex } }, updateObject);
        logger.info(`Boat data updated: ${boat.model}`);
      } else {
        logger.info(`No changes for boat: ${boat.model}`);
      }
    } else {
      const newBoat = new Sailboat(boatData);
      await newBoat.save();
      logger.info(`New boat data saved: ${boat.model}`);
    }
  } catch (error) {
    logger.error(`Error saving boat: ${error.message}`);
  }
};

const scrapePage = async (url, browser) => {
  try {
    const page = await fetchPage(url, browser);
    if (!page) return;

    if (url.includes("/sailboat/")) {
      const boat = await extractBoatData(page);
      if (Object.keys(boat).length > 0) {
        await saveBoat(boat, url);
      }
    }

    // Extract links to continue scraping
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a")).map((a) => a.href);
    });

    links
      .filter(
        (link) =>
          (link.includes("page") || link.includes("/sailboat/")) &&
          !link.includes("?units") &&
          !visitedURLs.has(link) &&
          !pendingURLs.has(link)
      )
      .forEach((link) => pendingURLs.add(link));

    await page.close();
    await randomDelay(500, 2000);
  } catch (error) {
    logger.error(`Error scraping page: ${error.message}`);
  }
};

/* -------------------------------------------------------------------------- */
/*                                    MAIN                                    */
/* -------------------------------------------------------------------------- */

const scrapeSailboatData = async () => {
  const browser = await puppeteer.launch({ headless: false });
  try {
    for (let i = 1; i < numberOfPages; i++) {
      const initialURL = `${baseURL}/?keyword&sort-select&sailboats_per_page=50&loa_min&loa_max&lwl_min&lwl_max&hull_type&sailboat_units=all&displacement_min&displacement_max&beam_min&beam_max&draft_max&bal_disp_min&bal_disp_max&sa_disp_min&sa_disp_max&disp_len_disp_min&disp_len_disp_max&comfort_ratio_min&comfort_ratio_max&capsize_ratio_min&capsize_ratio_max&taxonomy_rig&first_built_after&first_built_before&designer_name&builder_name&sailboats_first_letter&page_number=${i}`;
      await scrapePage(initialURL, browser);
    }

    while (pendingURLs.size > 0) {
      const url = pendingURLs.values().next().value;
      pendingURLs.delete(url);
      await scrapePage(url, browser);
    }
  } catch (error) {
    logger.error(`An error occurred during scraping: ${error.message}`);
  } finally {
    await browser.close();
    logger.info("Browser closed");
  }
};

module.exports = scrapeSailboatData;
