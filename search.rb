#!/usr/bin/env ruby
# frozen_string_literal: true

# Bookmarks search — finds bookmarks across Chrome, Edge, Brave, Vivaldi.
# Returns a list of matching bookmarks with Open and Copy URL actions.

require "yoki_plugin_sdk"
require "json"

# --- Browser bookmark paths (Windows) ---

BROWSERS = {
  "Chrome"  => File.join(ENV["LOCALAPPDATA"] || "", "Google", "Chrome", "User Data"),
  "Edge"    => File.join(ENV["LOCALAPPDATA"] || "", "Microsoft", "Edge", "User Data"),
  "Brave"   => File.join(ENV["LOCALAPPDATA"] || "", "BraveSoftware", "Brave-Browser", "User Data"),
  "Vivaldi" => File.join(ENV["LOCALAPPDATA"] || "", "Vivaldi", "Application", "User Data"),
}.freeze

ICONS = {
  "Chrome"  => "🌐",
  "Edge"    => "🔵",
  "Brave"   => "🦁",
  "Vivaldi" => "🔴",
}.freeze

# --- Bookmark parser ---

def find_profiles(user_data_dir)
  return [] unless File.directory?(user_data_dir)

  profiles = []
  # Default profile
  default_bm = File.join(user_data_dir, "Default", "Bookmarks")
  profiles << default_bm if File.exist?(default_bm)

  # Additional profiles (Profile 1, Profile 2, etc.)
  Dir.glob(File.join(user_data_dir, "Profile *", "Bookmarks")).each do |path|
    profiles << path if File.exist?(path)
  end

  profiles
end

def parse_bookmarks(file_path)
  data = JSON.parse(File.read(file_path, encoding: "utf-8"))
  bookmarks = []
  roots = data["roots"] || {}
  roots.each_value do |node|
    walk(node, [], bookmarks)
  end
  bookmarks
rescue StandardError
  []
end

def walk(node, path, results)
  return unless node.is_a?(Hash)

  if node["type"] == "url"
    results << {
      name: node["name"] || "",
      url: node["url"] || "",
      folder: path.join(" / "),
    }
  elsif node["type"] == "folder" && node["children"]
    folder_path = path + [node["name"] || ""]
    node["children"].each { |child| walk(child, folder_path, results) }
  end
end

# --- Search logic ---

def load_all_bookmarks
  all = []
  BROWSERS.each do |browser, user_data_dir|
    find_profiles(user_data_dir).each do |bm_path|
      parse_bookmarks(bm_path).each do |bm|
        all << bm.merge(browser: browser)
      end
    end
  end
  all
end

def search(bookmarks, query)
  return bookmarks if query.empty?

  words = query.downcase.split
  bookmarks.select do |bm|
    haystack = "#{bm[:name]} #{bm[:url]} #{bm[:folder]}".downcase
    words.all? { |w| haystack.include?(w) }
  end
end

# --- Main ---

input = Yoki.read_input
query = Yoki.strip_keyword(input["query"] || "", "search", "s")

bookmarks = load_all_bookmarks
results = search(bookmarks, query)

# Limit to 50 results for performance
results = results.first(50)

if results.empty? && !query.empty?
  Yoki.write_response(Yoki.error(
    "No bookmarks found",
    details: "Try a different search term"
  ))
  exit
end

if results.empty?
  Yoki.write_response(Yoki.error(
    "No bookmarks found",
    details: "No Chromium browsers with bookmarks detected"
  ))
  exit
end

items = results.map.with_index do |bm, i|
  icon = ICONS[bm[:browser]] || "🔖"
  subtitle = bm[:url].length > 80 ? bm[:url][0..77] + "..." : bm[:url]
  subtitle += "  ·  #{bm[:folder]}" unless bm[:folder].empty?
  subtitle += "  ·  #{bm[:browser]}"

  {
    id: "bm-#{i}",
    title: bm[:name].empty? ? bm[:url] : bm[:name],
    subtitle: subtitle,
    icon: icon,
    actions: [
      { title: "Open", shortcut: "enter", type: "open_url", url: bm[:url] },
      { title: "Copy URL", shortcut: "cmd+c", type: "copy", value: bm[:url] },
    ],
  }
end

Yoki.write_response(Yoki.list(items))
