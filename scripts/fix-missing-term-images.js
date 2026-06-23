#!/usr/bin/env node
/**
 * מחליף תמונות שנכשלו בהורדה ומריץ הורדה מחדש.
 * הרצה: node scripts/fix-missing-term-images.js
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const JSON_PATH = path.join(ROOT, "data", "term-images.json");

/** old remote URL -> replacement */
const REPLACEMENTS = {
  "https://upload.wikimedia.org/wikipedia/commons/4/4d/East_Jerusalem.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/East_Jerusalem.jpg/1280px-East_Jerusalem.jpg",
    caption: "East Jerusalem",
  },
  "https://upload.wikimedia.org/wikipedia/commons/0/04/Front_line_of_Kwajalein.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Israel-Lebanon-Syria-border-Conflict-2023.svg/1280px-Israel-Lebanon-Syria-border-Conflict-2023.svg.png",
    caption: "Israel-Lebanon-Syria border Conflict 2023",
  },
  "https://upload.wikimedia.org/wikipedia/commons/d/de/Infantry_marching_ahead_in_single_file_to_the_Front_Line_%282867578826%29.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/0/0b/UN_armistice_lines_1949.jpg",
    caption: "UN armistice lines 1949",
  },
  "https://upload.wikimedia.org/wikipedia/commons/1/1f/IDF_7th_Armored_Brigade_-_Lebanon-Ground-Incursion_04.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/IDF_7th_Armored_Brigade_-_Lebanon-Ground-Incursion_01.jpg/1280px-IDF_7th_Armored_Brigade_-_Lebanon-Ground-Incursion_01.jpg",
    caption: "IDF 7th Armored Brigade - Lebanon Ground Incursion 01",
  },
  "https://upload.wikimedia.org/wikipedia/commons/0/0f/Chinese_Occupation_Forces_at_Taihoku%2C_Formosa.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Israel_and_occupied_territories_map.png/1280px-Israel_and_occupied_territories_map.png",
    caption: "Israel and occupied territories map",
  },
  "https://upload.wikimedia.org/wikipedia/commons/e/e1/Confederate_occupation_marker_Frankfort_KY.png": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/West_Bank_July_2008_CIA_remote-sensing_map.jpg/1280px-West_Bank_July_2008_CIA_remote-sensing_map.jpg",
    caption: "West Bank July 2008 CIA remote-sensing map",
  },
  "https://upload.wikimedia.org/wikipedia/commons/8/8d/Operation-Northern-Shield-5.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Operation-Northern-Shield-5.jpg/1280px-Operation-Northern-Shield-5.jpg",
    caption: "Operation Northern Shield 5",
  },
  "https://upload.wikimedia.org/wikipedia/commons/d/d1/Operation-Northern-Shield-1.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/2/21/Operation-Northern-Shield-2.jpg",
    caption: "Operation Northern Shield 2",
  },
  "https://upload.wikimedia.org/wikipedia/commons/8/82/Abidjan_evacuation%2C_April_2011_%285692588431%29.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Abidjan_evacuation%2C_April_2011_%285692588431%29.jpg/1280px-Abidjan_evacuation%2C_April_2011_%285692588431%29.jpg",
    caption: "Abidjan evacuation, April 2011",
  },
  "https://upload.wikimedia.org/wikipedia/commons/8/8b/Abidjan_evacuation%2C_April_2011_%285693157510%29.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Flickr_-_Israel_Defense_Forces_-_The_Evacuation_of_Tel_Katifa_%286%29.jpg/1280px-Flickr_-_Israel_Defense_Forces_-_The_Evacuation_of_Tel_Katifa_%286%29.jpg",
    caption: "The Evacuation of Tel Katifa, Gush Katif 2005",
  },
  "https://upload.wikimedia.org/wikipedia/commons/8/8d/Casa_flotante.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Map_of_Palestine_-_Israel_depopulations%2C_1948-2006_-_Demographics_-_with_Legend.png/1280px-Map_of_Palestine_-_Israel_depopulations%2C_1948-2006_-_Demographics_-_with_Legend.png",
    caption: "Map of Palestine - Israel depopulations 1948-2006",
  },
  "https://upload.wikimedia.org/wikipedia/commons/8/87/Planning_Map_for_Ethnic_German_Settlement_of_Warthegau_%28annexed_from_Poland%29.png": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Planning_Map_for_Ethnic_German_Settlement_of_Warthegau_%28annexed_from_Poland%29.png/1280px-Planning_Map_for_Ethnic_German_Settlement_of_Warthegau_%28annexed_from_Poland%29.png",
    caption: "Planning Map for Ethnic German Settlement of Warthegau",
  },
  "https://upload.wikimedia.org/wikipedia/commons/2/25/Checkpoint_300.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Checkpoint_300.jpg/1280px-Checkpoint_300.jpg",
    caption: "Checkpoint 300",
  },
  "https://upload.wikimedia.org/wikipedia/commons/1/1f/Jewish_child_victim_of_Arab_riots_in_Hebron%2C_1929.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Jewish_home_plundered_by_Arab_rioters_in_Hebron_cropped.png/1280px-Jewish_home_plundered_by_Arab_rioters_in_Hebron_cropped.png",
    caption: "Jewish home plundered by Arab rioters in Hebron 1929",
  },
  "https://upload.wikimedia.org/wikipedia/commons/0/0e/Hebron_Massacre_of_1929_Victim%27s_Funeral.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Funeral_for_murdered_Jews_of_Safed_1929.jpg",
    caption: "Funeral for murdered Jews of Safed 1929",
  },
  "https://upload.wikimedia.org/wikipedia/commons/9/9c/House_destruction%2C_Hebron_1929.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/House_destruction%2C_Hebron_1929.jpg/1280px-House_destruction%2C_Hebron_1929.jpg",
    caption: "House destruction, Hebron 1929",
  },
  "https://upload.wikimedia.org/wikipedia/commons/c/c2/Tracy_Lee_Smart_in_the_video_Forward_Presence_for_Deterrence_%E2%80%93_Implications_for_the_Australian_Army.png": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Flickr_-_Israel_Defense_Forces_-_Iron_Dome_Battery_Deployed_Near_Ashkelon.jpg/1280px-Flickr_-_Israel_Defense_Forces_-_Iron_Dome_Battery_Deployed_Near_Ashkelon.jpg",
    caption: "Iron Dome Battery Deployed Near Ashkelon",
  },
  "https://upload.wikimedia.org/wikipedia/commons/6/63/Desecrated_synagogue%2C_Hebron_1929.jpg": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Desecrated_synagogue%2C_Hebron_1929.jpg/1280px-Desecrated_synagogue%2C_Hebron_1929.jpg",
    caption: "Desecrated synagogue, Hebron 1929",
  },
  "https://upload.wikimedia.org/wikipedia/commons/f/fe/1947-UN-Partition-Plan-1949-Armistice-Comparison.png": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/1947-UN-Partition-Plan-1949-Armistice-Comparison.svg/1280px-1947-UN-Partition-Plan-1949-Armistice-Comparison.svg.png",
    caption: "1947 UN Partition Plan - 1949 Armistice Comparison",
  },
};

function applyReplacements(data) {
  let count = 0;
  for (const entry of Object.values(data.terms || {})) {
    for (const image of entry?.images || []) {
      if (typeof image === "string") continue;
      const keys = [image.url, image.remoteUrl].filter(Boolean);
      for (const key of keys) {
        const rep = REPLACEMENTS[key];
        if (!rep) continue;
        image.remoteUrl = rep.url;
        image.url = rep.url;
        image.caption = rep.caption;
        count++;
        break;
      }
    }
  }
  return count;
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
const updated = applyReplacements(data);
fs.writeFileSync(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`עודכנו ${updated} תמונות ב-${JSON_PATH}`);

console.log("מריץ הורדה…");
execFileSync("node", [path.join(__dirname, "download-term-images.js")], {
  stdio: "inherit",
  cwd: ROOT,
});
