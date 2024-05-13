const mongoose = require("mongoose");
const puppeteer = require("puppeteer");

/* -------------------------------------------------------------------------- */
/*                              CONFIG VARIABLES                              */
/* -------------------------------------------------------------------------- */
const baseURL = "https://sailboatdata.com";
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
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", function () {
  console.log("We're connected!");
});

const Schema = mongoose.Schema;

const sailboatSchema = new Schema({
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
  designer: String,
  builders: String,
  association: String,
  products: String,
});

const sailboat = mongoose.model("sailboat", sailboatSchema);

/* -------------------------------------------------------------------------- */
/*                                    TOOLS                                   */
/* -------------------------------------------------------------------------- */

function randomDelay(min, max) {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min))
  );
}

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

async function fetchPage(url, browser) {
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    if (visitedURLs.has(url)) {
      console.log("URL already visited.");
      await page.close();
      return null;
    }

    visitedURLs.add(url);
    console.log(`Scraping ${url}`);
    return page;
  } catch (error) {
    console.log("Error fetching page:", error);
  }
}

function getboat(page) {
  return new Promise(async (resolve, reject) => {
    try {
      const boat = await page.evaluate(() => {
        const model = document.querySelector("h1")
          ? document.querySelector("h1").innerText.trim()
          : "";

        const data = {};
        const tr = Array.from(document.querySelectorAll("tr"));

        tr.forEach((tr) => {
          const td = tr.querySelectorAll("td");
          // for each td get the text content
          const tdTexts = Array.from(td).map((td) => td.textContent.trim());

          if (tdTexts.length === 2) {
            data[tdTexts[0].replace(":", "")] = tdTexts[1];
          }
        });

        return { model, data };
      });

      resolve(boat);
    } catch (error) {
      console.log("Error getting boat data:", error);
    }
  });
}

function saveBoat(boat, url) {
  function cleanStr(str, pos) {
    try {
      return str.split("/")[pos].trim().split(" ")[0].replace(",", "").trim();
    } catch (error) {
      console.log("Error cleaning string:", error);
    }
  }

  try {
    const boatData = {
      url,
      model: boat.model,
      hull_type: boat.data["Hull Type"] || "",
      rigging_type: boat.data["Rigging Type"] || "",
      loa: {
        ft: parseFloat(cleanStr(boat.data["LOA"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["LOA"], 1)) || -1,
      },
      lwl: {
        ft: parseFloat(cleanStr(boat.data["LWL"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["LWL"], 1)) || -1,
      },
      sail_area: {
        ft2: parseFloat(cleanStr(boat.data["S.A. (reported)"], 0)) || -1,
        m2: parseFloat(cleanStr(boat.data["S.A. (reported)"], 1)) || -1,
      },
      beam: {
        ft: parseFloat(cleanStr(boat.data["Beam"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["Beam"], 1)) || -1,
      },
      displacement: {
        lb: parseFloat(cleanStr(boat.data["Displacement"], 0)) || -1,
        kg: parseFloat(cleanStr(boat.data["Displacement"], 1)) || -1,
      },
      ballast: {
        lb: parseFloat(cleanStr(boat.data["Ballast"], 0)) || -1,
        kg: parseFloat(cleanStr(boat.data["Ballast"], 1)) || -1,
      },
      max_draft: {
        ft: parseFloat(cleanStr(boat.data["Max Draft"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["Max Draft"], 1)) || -1,
      },
      construction: boat.data["Construction"] || "",
      ballast_type: boat.data["Ballast Type"] || "",
      first_built: boat.data["First Built"]
        ? new Date(boat.data["First Built"]).toISOString().split("T")[0]
        : "",
      built_number: parseInt(boat.data["# Built"]) || -1,
      designer: boat.data["Designer"] || "",
      sail_area_displacement: parseFloat(boat.data["S.A. / Displ."]) || -1,
      ballast_displacement: parseFloat(boat.data["Bal. / Displ."]) || -1,
      displacement_length: parseFloat(boat.data["Disp / Len:"]) || -1,
      comfort_ratio: parseInt(boat.data["Comfort Ratio"]) || -1,
      capsize_ratio: parseFloat(boat.data["Capsize Screening Formula"]) || -1,
      s_number: parseFloat(boat.data["S#"]) || -1,
      hull_speed: parseFloat(cleanStr(boat.data["Hull Speed"], 0)) || -1,
      pound_inch_immersion:
        parseFloat(cleanStr(boat.data["Pounds/Inch Immersion"], 0)) || -1,
      i: {
        ft: parseFloat(cleanStr(boat.data["I"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["I"], 1)) || -1,
      },
      j: {
        ft: parseFloat(cleanStr(boat.data["J"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["J"], 1)) || -1,
      },
      p: {
        ft: parseFloat(cleanStr(boat.data["P"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["P"], 1)) || -1,
      },
      e: {
        ft: parseFloat(cleanStr(boat.data["E"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["E"], 1)) || -1,
      },
      spl_tps: {
        ft: parseFloat(cleanStr(boat.data["SPL/TPS"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["SPL/TPS"], 1)) || -1,
      },
      isp: {
        ft: parseFloat(cleanStr(boat.data["ISP"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["ISP"], 1)) || -1,
      },
      sail_area_fore: {
        ft2: parseFloat(cleanStr(boat.data["S.A. Fore"], 0)) || -1,
        m2: parseFloat(cleanStr(boat.data["S.A. Fore"], 1)) || -1,
      },
      sail_area_main: {
        ft2: parseFloat(cleanStr(boat.data["S.A. Main"], 0)) || -1,
        m2: parseFloat(cleanStr(boat.data["S.A. Main"], 1)) || -1,
      },
      sail_area_total: {
        ft2:
          parseFloat(
            cleanStr(boat.data["S.A. Total (100% Fore + Main Triangles)"], 0)
          ) || -1,
        m2:
          parseFloat(
            cleanStr(boat.data["S.A. Total (100% Fore + Main Triangles)"], 1)
          ) || -1,
      },
      sail_area_displacement_calc:
        parseFloat(cleanStr(boat.data["S.A./Displ. (calc.)"], 0)) || -1,

      forestay_length: {
        ft: parseFloat(cleanStr(boat.data["Est. Forestay Length"], 0)) || -1,
        m: parseFloat(cleanStr(boat.data["Est. Forestay Length"], 1)) || -1,
      },
      designer: boat.data["Designer"] || "",
      builders: boat.data["Builders"] || "",
      association: boat.data["Associations"] || "",
      products: boat.data["Products"] || "",
    };

    const newBoat = new sailboat(boatData);

    sailboat.findOne({ model: boat.model }).then((boat) => {
      if (boat) {
        console.log("Boat already exists in database.");
      } else {
        newBoat.save();
      }
    });
  } catch (error) {
    console.log("Error saving boat:", error);
  }
}

async function scrapePage(url, browser) {
  const page = await fetchPage(url, browser);
  if (!page) return;

  const boat = url.includes("/sailboat/") ? await getboat(page) : {};

  if (Object.keys(boat).length > 0) {
    saveBoat(boat, url);
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
  await randomDelay(1000, 3000);
}

/* -------------------------------------------------------------------------- */
/*                                    MAIN                                    */
/* -------------------------------------------------------------------------- */

async function scrapeYatchWorld() {
  const browser = await puppeteer.launch({ headless: false });
  try {
    for (let i = 0; i < 181; i++) {
      const url = `https://sailboatdata.com/?keyword&sort-select&sailboats_per_page=50&loa_min&loa_max&lwl_min&lwl_max&hull_type&sailboat_units=all&displacement_min&displacement_max&beam_min&beam_max&draft_max&bal_disp_min&bal_disp_max&sa_disp_min&sa_disp_max&disp_len_disp_min&disp_len_disp_max&comfort_ratio_min&comfort_ratio_max&capsize_ratio_min&capsize_ratio_max&taxonomy_rig&first_built_after&first_built_before&designer_name&builder_name&sailboats_first_letter&page_number=${i}`;

      await scrapePage(url, browser);
    }
    // pendingURLs.add(baseURL);
    while (pendingURLs.size > 0) {
      const url = pendingURLs.values().next().value;
      pendingURLs.delete(url); // Move the URL from pending to processing
      await scrapePage(url, browser);
    }
  } catch (error) {
    console.error("An error occurred during scraping:", error);
  } finally {
    await browser.close();
  }
}

module.exports = scrapeYatchWorld;
