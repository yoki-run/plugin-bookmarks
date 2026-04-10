/**
 * browser.js — detect default browser and provide profile paths.
 */
"use strict";

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const LOCAL = process.env.LOCALAPPDATA || "";
const ROAMING = process.env.APPDATA || "";

const BROWSERS = {
  ChromeHTML: {
    name: "Chrome",
    userDataDir: path.join(LOCAL, "Google", "Chrome", "User Data"),
  },
  MSEdgeHTM: {
    name: "Edge",
    userDataDir: path.join(LOCAL, "Microsoft", "Edge", "User Data"),
  },
  "MSEdgeDHTML": {
    name: "Edge Dev",
    userDataDir: path.join(LOCAL, "Microsoft", "Edge Dev", "User Data"),
  },
  BraveHTML: {
    name: "Brave",
    userDataDir: path.join(LOCAL, "BraveSoftware", "Brave-Browser", "User Data"),
  },
  VivaldiHTM: {
    name: "Vivaldi",
    userDataDir: path.join(LOCAL, "Vivaldi", "Application", "User Data"),
  },
  "FirefoxURL-308046B0AF4A39CB": {
    name: "Firefox",
    profilesDir: path.join(ROAMING, "Mozilla", "Firefox", "Profiles"),
  },
};

// Detect default browser via Windows Registry
function getDefaultBrowserId() {
  try {
    const cmd = 'reg query "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice" /v ProgId';
    const output = execSync(cmd, { encoding: "utf-8" });
    const match = output.match(/ProgId\s+REG_SZ\s+(.+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

function getDefaultBrowser() {
  const progId = getDefaultBrowserId();
  if (!progId) return null;

  // Exact match
  if (BROWSERS[progId]) return { ...BROWSERS[progId], progId };

  // Partial match (e.g. FirefoxURL-XXXXX)
  for (const [key, info] of Object.entries(BROWSERS)) {
    if (progId.startsWith(key.split("-")[0])) return { ...info, progId };
  }
  return null;
}

// Get profile paths for Chromium browsers
function getChromiumProfiles(userDataDir) {
  if (!fs.existsSync(userDataDir)) return [];
  const profiles = [];
  const defaultPath = path.join(userDataDir, "Default");
  if (fs.existsSync(defaultPath)) profiles.push(defaultPath);

  try {
    for (const entry of fs.readdirSync(userDataDir)) {
      if (entry.startsWith("Profile ")) {
        const p = path.join(userDataDir, entry);
        if (fs.statSync(p).isDirectory()) profiles.push(p);
      }
    }
  } catch { /* ignore */ }
  return profiles;
}

// Get Firefox profile paths
function getFirefoxProfiles(profilesDir) {
  if (!fs.existsSync(profilesDir)) return [];
  try {
    return fs.readdirSync(profilesDir)
      .map(d => path.join(profilesDir, d))
      .filter(p => fs.statSync(p).isDirectory());
  } catch {
    return [];
  }
}

module.exports = {
  BROWSERS, getDefaultBrowser, getDefaultBrowserId,
  getChromiumProfiles, getFirefoxProfiles,
};
