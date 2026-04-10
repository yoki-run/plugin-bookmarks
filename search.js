#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { readInput, writeResponse, list, error, stripKeyword } = require("@yoki/plugin-sdk");

// --- Browser bookmark paths (Windows) ---

const LOCALAPPDATA = process.env.LOCALAPPDATA || "";

const BROWSERS = {
  Chrome:  path.join(LOCALAPPDATA, "Google", "Chrome", "User Data"),
  Edge:    path.join(LOCALAPPDATA, "Microsoft", "Edge", "User Data"),
  Brave:   path.join(LOCALAPPDATA, "BraveSoftware", "Brave-Browser", "User Data"),
  Vivaldi: path.join(LOCALAPPDATA, "Vivaldi", "Application", "User Data"),
};

const ICONS = {
  Chrome:  "\u{1F310}",
  Edge:    "\u{1F535}",
  Brave:   "\u{1F981}",
  Vivaldi: "\u{1F534}",
};

// --- Bookmark parser ---

function findProfiles(userDataDir) {
  if (!fs.existsSync(userDataDir) || !fs.statSync(userDataDir).isDirectory()) {
    return [];
  }

  const profiles = [];

  // Default profile
  const defaultBm = path.join(userDataDir, "Default", "Bookmarks");
  if (fs.existsSync(defaultBm)) {
    profiles.push(defaultBm);
  }

  // Additional profiles (Profile 1, Profile 2, etc.)
  try {
    const entries = fs.readdirSync(userDataDir);
    for (const entry of entries) {
      if (/^Profile /.test(entry)) {
        const bmPath = path.join(userDataDir, entry, "Bookmarks");
        if (fs.existsSync(bmPath)) {
          profiles.push(bmPath);
        }
      }
    }
  } catch (_) {
    // ignore read errors
  }

  return profiles;
}

function parseBookmarks(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const bookmarks = [];
    const roots = data.roots || {};
    for (const key of Object.keys(roots)) {
      walk(roots[key], [], bookmarks);
    }
    return bookmarks;
  } catch (_) {
    return [];
  }
}

function walk(node, folderPath, results) {
  if (!node || typeof node !== "object") return;

  if (node.type === "url") {
    results.push({
      name: node.name || "",
      url: node.url || "",
      folder: folderPath.join(" / "),
    });
  } else if (node.type === "folder" && Array.isArray(node.children)) {
    const newPath = folderPath.concat(node.name || "");
    for (const child of node.children) {
      walk(child, newPath, results);
    }
  }
}

// --- Search logic ---

function loadAllBookmarks() {
  const all = [];
  for (const [browser, userDataDir] of Object.entries(BROWSERS)) {
    const profiles = findProfiles(userDataDir);
    for (const bmPath of profiles) {
      const bookmarks = parseBookmarks(bmPath);
      for (const bm of bookmarks) {
        bm.browser = browser;
        all.push(bm);
      }
    }
  }
  return all;
}

function search(bookmarks, query) {
  if (!query) return bookmarks;

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return bookmarks.filter((bm) => {
    const haystack = `${bm.name} ${bm.url} ${bm.folder}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

function faviconUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  } catch (_) {
    return null;
  }
}

// --- Main ---

readInput().then((input) => {
  const query = stripKeyword(input.query || "", "search", "s");

  const bookmarks = loadAllBookmarks();
  let results = search(bookmarks, query);

  // Limit to 50 results for performance
  results = results.slice(0, 50);

  if (results.length === 0 && query) {
    writeResponse(error("No bookmarks found", "Try a different search term"));
    return;
  }

  if (results.length === 0) {
    writeResponse(error("No bookmarks found", "No Chromium browsers with bookmarks detected"));
    return;
  }

  const items = results.map((bm, i) => {
    let subtitle = bm.url.length > 80 ? bm.url.slice(0, 78) + "..." : bm.url;
    if (bm.folder) subtitle += `  \u00b7  ${bm.folder}`;
    subtitle += `  \u00b7  ${bm.browser}`;

    const item = {
      id: `bm-${i}`,
      title: bm.name || bm.url,
      subtitle,
      actions: [
        { title: "Open", shortcut: "enter", type: "open_url", url: bm.url },
        { title: "Copy URL", shortcut: "cmd+c", type: "copy", value: bm.url },
      ],
    };

    const fav = faviconUrl(bm.url);
    if (fav) {
      item.icon_url = fav;
    } else {
      item.icon = ICONS[bm.browser] || "\u{1F516}";
    }

    return item;
  });

  writeResponse(list(items));
});
