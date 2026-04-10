#!/usr/bin/env node
/**
 * history.js — Search browser history (default browser).
 *
 * Usage: bm h <query>   or   bm hist <query>
 *
 * Copies the SQLite History file to temp (browser locks it),
 * queries with better-sqlite3, returns list results.
 */
"use strict";

const { readInput, writeResponse, list, error, stripKeyword } = require("@yoki/plugin-sdk");
const Database = require("better-sqlite3");
const { getDefaultBrowser, getChromiumProfiles, getFirefoxProfiles } = require("./browser");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Chrome timestamps are microseconds since 1601-01-01
const CHROME_EPOCH = 11644473600000000n;

function chromeTimeToDate(microseconds) {
  if (!microseconds || microseconds <= 0) return null;
  const ms = Number((BigInt(microseconds) - CHROME_EPOCH) / 1000n);
  return new Date(ms);
}

// Firefox timestamps are microseconds since Unix epoch
function firefoxTimeToDate(microseconds) {
  if (!microseconds || microseconds <= 0) return null;
  return new Date(Number(BigInt(microseconds) / 1000n));
}

function timeAgo(date) {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function queryChromiumHistory(profilePath, query, limit) {
  const histFile = path.join(profilePath, "History");
  if (!fs.existsSync(histFile)) return [];

  // Copy to temp — browser locks the file
  const tmp = path.join(os.tmpdir(), `yoki_hist_${Date.now()}.db`);
  try {
    fs.copyFileSync(histFile, tmp);
    const db = new Database(tmp, { readonly: true, fileMustExist: true });

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let sql, params;

    if (words.length > 0) {
      const where = words.map(() => "(LOWER(url) LIKE ? OR LOWER(title) LIKE ?)").join(" AND ");
      params = words.flatMap(w => [`%${w}%`, `%${w}%`]);
      sql = `SELECT url, title, last_visit_time, visit_count FROM urls WHERE ${where} ORDER BY last_visit_time DESC LIMIT ?`;
      params.push(limit);
    } else {
      sql = "SELECT url, title, last_visit_time, visit_count FROM urls ORDER BY last_visit_time DESC LIMIT ?";
      params = [limit];
    }

    const rows = db.prepare(sql).all(...params);
    db.close();
    return rows.map(r => ({
      url: r.url,
      title: r.title || r.url,
      date: chromeTimeToDate(r.last_visit_time),
      visits: r.visit_count,
    }));
  } catch (e) {
    return [];
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function queryFirefoxHistory(profilePath, query, limit) {
  const placesFile = path.join(profilePath, "places.sqlite");
  if (!fs.existsSync(placesFile)) return [];

  const tmp = path.join(os.tmpdir(), `yoki_ff_hist_${Date.now()}.db`);
  try {
    fs.copyFileSync(placesFile, tmp);
    const db = new Database(tmp, { readonly: true, fileMustExist: true });

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let sql, params;

    if (words.length > 0) {
      const where = words.map(() => "(LOWER(p.url) LIKE ? OR LOWER(p.title) LIKE ?)").join(" AND ");
      params = words.flatMap(w => [`%${w}%`, `%${w}%`]);
      sql = `SELECT p.url, p.title, p.last_visit_date, p.visit_count FROM moz_places p WHERE ${where} ORDER BY p.last_visit_date DESC LIMIT ?`;
      params.push(limit);
    } else {
      sql = "SELECT url, title, last_visit_date, visit_count FROM moz_places ORDER BY last_visit_date DESC LIMIT ?";
      params = [limit];
    }

    const rows = db.prepare(sql).all(...params);
    db.close();
    return rows.map(r => ({
      url: r.url,
      title: r.title || r.url,
      date: firefoxTimeToDate(r.last_visit_date),
      visits: r.visit_count,
    }));
  } catch {
    return [];
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

async function main() {
  const input = await readInput();
  const query = stripKeyword(input.query || "", "history", "hist", "h");

  const browser = getDefaultBrowser();
  if (!browser) {
    writeResponse(error("Could not detect default browser"));
    return;
  }

  let results = [];
  const limit = 50;

  if (browser.profilesDir) {
    // Firefox
    const profiles = getFirefoxProfiles(browser.profilesDir);
    for (const p of profiles) {
      results.push(...queryFirefoxHistory(p, query, limit));
    }
  } else if (browser.userDataDir) {
    // Chromium
    const profiles = getChromiumProfiles(browser.userDataDir);
    for (const p of profiles) {
      results.push(...queryChromiumHistory(p, query, limit));
    }
  }

  // Sort by date descending, deduplicate by URL, limit to 50
  const seen = new Set();
  results = results
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
    .filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .slice(0, limit);

  if (results.length === 0 && query) {
    writeResponse(error("No history found", `No results for "${query}" in ${browser.name}`));
    return;
  }

  if (results.length === 0) {
    writeResponse(error("No history", `Could not read history from ${browser.name}`));
    return;
  }

  const items = results.map((r, i) => {
    const when = timeAgo(r.date);
    const subtitle = `${r.url.length > 70 ? r.url.slice(0, 67) + "..." : r.url}${when ? "  ·  " + when : ""}`;
    return {
      id: `h-${i}`,
      title: r.title,
      subtitle,
      icon: "🕐",
      actions: [
        { title: "Open", shortcut: "enter", type: "open_url", url: r.url },
        { title: "Copy URL", shortcut: "cmd+c", type: "copy", value: r.url },
      ],
    };
  });

  writeResponse(list(items));
}

main();
