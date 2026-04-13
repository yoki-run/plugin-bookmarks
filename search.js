#!/usr/bin/env node
/**
 * search.js — Search bookmarks in default browser.
 *
 * Usage: bm <query>
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { readInput, writeResponse, list, error, stripKeyword } = require("@yoki/plugin-sdk");
const { getDefaultBrowser, getChromiumProfiles, getFirefoxProfiles } = require("./browser");

// --- Bookmark parsing ---

function findChromiumBookmarks(profilePath) {
  const bmFile = path.join(profilePath, "Bookmarks");
  if (!fs.existsSync(bmFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(bmFile, "utf-8"));
    const results = [];
    const walk = (node, folder) => {
      if (!node) return;
      if (node.type === "url") {
        results.push({ name: node.name || "", url: node.url || "", folder: folder.join(" / ") });
      } else if (node.type === "folder" && node.children) {
        const path = [...folder, node.name || ""];
        node.children.forEach(c => walk(c, path));
      }
    };
    if (data.roots) Object.values(data.roots).forEach(r => walk(r, []));
    return results;
  } catch { return []; }
}

function findFirefoxBookmarks(profilePath) {
  // Firefox bookmarks are in places.sqlite — need better-sqlite3
  const Database = require("better-sqlite3");
  const placesFile = path.join(profilePath, "places.sqlite");
  if (!fs.existsSync(placesFile)) return [];

  const os = require("os");
  const tmp = path.join(os.tmpdir(), `yoki_ff_bm_${Date.now()}.db`);
  try {
    fs.copyFileSync(placesFile, tmp);
    const db = new Database(tmp, { readonly: true, fileMustExist: true });
    const rows = db.prepare(`
      SELECT b.title, p.url, pa.title as folder
      FROM moz_bookmarks b
      JOIN moz_places p ON b.fk = p.id
      LEFT JOIN moz_bookmarks pa ON b.parent = pa.id
      WHERE b.type = 1 AND p.url NOT LIKE 'place:%'
    `).all();
    db.close();
    return rows.map(r => ({ name: r.title || "", url: r.url || "", folder: r.folder || "" }));
  } catch { return []; }
  finally { try { fs.unlinkSync(tmp); } catch {} }
}

// --- Main ---

async function main() {
  const input = await readInput();
  const query = stripKeyword(input.query || "", "search", "s");

  const browser = getDefaultBrowser();
  if (!browser) {
    writeResponse(error("Could not detect default browser"));
    return;
  }

  let bookmarks = [];

  if (browser.profilesDir) {
    // Firefox
    const profiles = getFirefoxProfiles(browser.profilesDir);
    for (const p of profiles) bookmarks.push(...findFirefoxBookmarks(p));
  } else if (browser.userDataDir) {
    // Chromium
    const profiles = getChromiumProfiles(browser.userDataDir);
    for (const p of profiles) bookmarks.push(...findChromiumBookmarks(p));
  }

  // Filter
  const words = (query || "").toLowerCase().split(/\s+/).filter(Boolean);
  let filtered = bookmarks;
  if (words.length > 0) {
    filtered = bookmarks.filter(bm => {
      const hay = `${bm.name} ${bm.url} ${bm.folder}`.toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }

  filtered = filtered.slice(0, 50);

  if (filtered.length === 0 && query) {
    writeResponse(error("No bookmarks found", `No results for "${query}" in ${browser.name}`));
    return;
  }
  if (filtered.length === 0) {
    writeResponse(error("No bookmarks", `No bookmarks found in ${browser.name}`));
    return;
  }

  const items = filtered.map((bm, i) => {
    let subtitle = bm.url.length > 70 ? bm.url.slice(0, 67) + "..." : bm.url;
    if (bm.folder) subtitle += `  ·  ${bm.folder}`;
    subtitle += `  ·  ${browser.name}`;
    return {
      id: `bm-${i}`,
      title: bm.name || bm.url,
      subtitle,
      icon: "🔖",
      actions: [
        { title: "Open", shortcut: "enter", type: "open_url", url: bm.url },
        { title: "Copy URL", shortcut: "cmd+c", type: "copy", value: bm.url },
      ],
    };
  });

  writeResponse(list(items));
}

main().catch(e => { try { writeResponse(error("Error", e.message)); } catch(_) {} process.exit(1); });
