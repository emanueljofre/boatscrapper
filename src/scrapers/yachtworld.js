const axios = require("axios");
const cheerio = require("cheerio");
const { get } = require("mongoose");

/* -------------------------------------------------------------------------- */
/*                              CONFIG VARIABLES                              */
/* -------------------------------------------------------------------------- */
const baseURL = "https://www.yachtworld.com";
const initialURL = "https://www.yachtworld.com/boats-for-sale/type-sail/";
const visitedURLs = new Set();
const pendingURLs = new Set();
const scrappedData = [];

/* -------------------------------------------------------------------------- */
/*                                    TOOLS                                   */
/* -------------------------------------------------------------------------- */

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDelay(min, max) {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min))
  );
}

function isNumber(string) {
  return !isNaN(string);
}

function getPrice(str) {
  const price = str.replace(/\D/g, "");
  return price ? Number(price) : 0;
}

function getYear(str) {
  const year = str.match(/\d{4}/);
  return year ? Number(year[0]) : 0;
}
function getFeet(str) {
  const feet = str.match(/\d{2,3}ft/);
  return feet ? Number(feet[0].replace("ft", "")) : 0;
}

function getModel(str) {
  // Remove feet from model
  const model = str.split("|")[0].trim();
  // Remove year from model
  return model.replace(/\d{4}/, "").trim();
}

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

async function fetchHTML(url) {
  try {
    const axiosConfig = {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
        user: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,/;q=0.8,application/signed-exchange;v=b3;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        accept: "application/json",
        "accept-language": "en,es-ES;q=0.9,es;q=0.8",
        pragma: "no-cache",
        "sec-ch-ua":
          '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
      },
    };

    const response = await axios.get(url, axiosConfig);
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

function getBoatData($) {
  let model = "";
  let price = 0;
  let year = 0;
  let feet = 0;

  /* --------------------------- Get model and year --------------------------- */
  $("h1").each((i, element) => {
    const title = $(element).text().trim();
    model = getModel(title);
    year = getYear(title);
    feet = getFeet(title);
  });

  /* -------------------------------- Get price ------------------------------- */
  $("p").each((i, element) => {
    const text = $(element).text().trim();

    if (text.includes("US$")) {
      price = getPrice(text);
    }
  });

  return { model, price, year, feet };
}

async function scrapePage(url, scrapper) {
  try {
    if (visitedURLs.has(url)) {
      console.log("URL already visited.");
      return;
    }
    if (!url.startsWith(baseURL)) {
      console.log("URL out of scope");
      return;
    }

    console.log(`Scraping ${url}`);
    const html = await fetchHTML(url);
    visitedURLs.add(url);

    if (!html) {
      console.log("No html");
      return;
    }

    const $ = cheerio.load(html);
    const links = [];

    /* ---------------------------- Extract boat data --------------------------- */
    if (url.includes("/yacht/")) {
      const boatData = getBoatData($);
      console.log(boatData);
    }

    /* ------------------- Extract links to continue scrapping ------------------ */
    $("a").each((_, element) => {
      const href = $(element).attr("href");

      if (href) {
        if (href.includes("/type-sail/page") || href.includes("/yacht/")) {
          const absoluteUrl = new URL(href, url).href;
          pendingURLs.add(absoluteUrl);
        }
      }
    });

    return randomDelay(1000, 3000);
  } catch (error) {
    console.log(error);
  }
}

/* -------------------------------------------------------------------------- */
/*                                    MAIN                                    */
/* -------------------------------------------------------------------------- */

async function scrapeYatchWorld() {
  await scrapePage(initialURL); // Starting URL

  for (const pendingURL of pendingURLs) {
    await scrapePage(pendingURL);
    pendingURLs.delete(pendingURL); // Delete the value after processing
  }
}

module.exports = scrapeYatchWorld;
