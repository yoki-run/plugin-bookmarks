# yoki-plugin-bookmarks

Search Chrome, Edge, Brave, and Vivaldi bookmarks instantly from [Yoki](https://yoki.run).

**Language:** Ruby (pure stdlib, zero dependencies)

## Install

From Yoki marketplace, or manually:

```
git clone <repo-url> ~/yoki/plugins/bookmarks
```

Requires: **Yoki >= 1.0.7.10**, **Ruby >= 2.7**

## Usage

```
bm                     → list all bookmarks
bm github              → search for "github"
bm docs api            → multi-word search
```

- **Enter** — open bookmark in browser
- **Cmd+C** — copy URL to clipboard

## Features

- Searches across **Chrome, Edge, Brave, Vivaldi** simultaneously
- Shows folder path and browser source
- Multi-word fuzzy search (all words must match)
- Reads directly from browser bookmark files (no API needed)
- Works offline

## SDK v2 Showcase

Demonstrates the Yoki Plugin SDK v2 in **Ruby**:

| Feature | How |
|---------|-----|
| List mode | Searchable bookmark results |
| Multi-browser | Detects all Chromium browsers |
| open_url action | Enter opens in default browser |
| copy action | Cmd+C copies URL |
| Bundled SDK | `require "yoki_plugin_sdk"` — no gem install |
