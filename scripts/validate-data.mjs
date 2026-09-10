#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const DATA_PATH = new URL("../data/locations.json", import.meta.url);
const REQUIRED_FIELDS = [
  "id",
  "name",
  "building",
  "floor",
  "category",
  "description",
  "lat",
  "lng",
  "tags",
  "visibility",
  "minZoom",
  "directions"
];
const VALID_CATEGORIES = new Set([
  "classroom",
  "restroom",
  "office",
  "facility",
  "sports",
  "parking",
  "dining"
]);
const VALID_VISIBILITY = new Set([
  "zoom-dependent",
  "search-only",
  "always",
  "event-only",
  "hidden",
  null
]);
const VALID_DIRECTIONS = new Set(["walking", "driving"]);
const CAMPUS_BOUNDS = {
  north: 29.748,
  south: 29.734,
  east: -95.422,
  west: -95.44
};

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`✗ ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

try {
  const rawData = await readFile(DATA_PATH, "utf8");
  const locations = JSON.parse(rawData);

  assert(Array.isArray(locations), "Top-level JSON value must be an array.");
  if (!Array.isArray(locations)) {
    process.exitCode = 1;
  } else {
    const seenIds = new Set();

    locations.forEach((location, index) => {
      const label = `Entry ${index + 1}${location?.name ? ` (${location.name})` : ""}`;

      REQUIRED_FIELDS.forEach((field) => {
        assert(Object.hasOwn(location, field), `${label} is missing “${field}”.`);
      });

      assert(Number.isInteger(location.id) && location.id > 0, `${label} has an invalid id.`);
      assert(!seenIds.has(location.id), `${label} repeats id ${location.id}.`);
      seenIds.add(location.id);

      assert(typeof location.name === "string" && location.name.trim(), `${label} needs a name.`);
      assert(
        typeof location.building === "string" && location.building.trim(),
        `${label} needs a building.`
      );
      assert(Number.isInteger(location.floor) && location.floor >= 0, `${label} has an invalid floor.`);
      assert(VALID_CATEGORIES.has(location.category), `${label} has an invalid category.`);
      assert(VALID_VISIBILITY.has(location.visibility), `${label} has an invalid visibility.`);

      if (["search-only", "event-only", "hidden"].includes(location.visibility)) {
        assert(location.minZoom === null, `${label} must use a null minZoom.`);
      } else if (location.visibility === null) {
        assert(location.minZoom === 0, `${label} must use minZoom 0.`);
        assert(location.maxZoom === 16, `${label} must use maxZoom 16.`);
      } else if (location.visibility === "always") {
        assert(location.minZoom === 0, `${label} must use minZoom 0.`);
      } else {
        assert(
          Number.isInteger(location.minZoom) && location.minZoom >= 16 && location.minZoom <= 19,
          `${label} must use an integer minZoom from 16 through 19.`
        );
      }
      assert(
        typeof location.description === "string" && location.description.trim(),
        `${label} needs a description.`
      );
      assert(Number.isFinite(location.lat), `${label} has an invalid latitude.`);
      assert(Number.isFinite(location.lng), `${label} has an invalid longitude.`);
      assert(
        location.lat >= CAMPUS_BOUNDS.south && location.lat <= CAMPUS_BOUNDS.north,
        `${label} is outside the expected campus latitude bounds.`
      );
      assert(
        location.lng >= CAMPUS_BOUNDS.west && location.lng <= CAMPUS_BOUNDS.east,
        `${label} is outside the expected campus longitude bounds.`
      );
      assert(
        Array.isArray(location.tags) &&
          location.tags.length > 0 &&
          location.tags.every((tag) => typeof tag === "string" && tag.trim()),
        `${label} must have at least one non-empty string tag.`
      );
      assert(
        Array.isArray(location.directions) &&
          location.directions.length > 0 &&
          location.directions.every((mode) => VALID_DIRECTIONS.has(mode)) &&
          new Set(location.directions).size === location.directions.length,
        `${label} has invalid or duplicate direction modes.`
      );
      assert(location.directions?.includes("walking"), `${label} must allow walking directions.`);

      if (
        location.category === "parking" ||
        /^Gate (?:[1-9]|1[0-4])$/.test(location.name)
      ) {
        assert(
          location.directions?.includes("driving"),
          `${label} must allow driving directions.`
        );
      }

      if (/^[MQ]\d{3}$/.test(location.name)) {
        assert(
          location.visibility === "search-only",
          `${label} is a nested room and must use search-only visibility.`
        );
      }
    });

    const alwaysVisibleLocations = locations.filter(
      (location) => location.visibility === "always"
    );
    assert(
      alwaysVisibleLocations.length <= 1,
      "At most one always-visible location is allowed."
    );
    const nullVisibilityLocations = locations.filter(
      (location) => location.visibility === null
    );
    assert(
      nullVisibilityLocations.length === 1 &&
        nullVisibilityLocations[0]?.name === "St. John's School",
      "Exactly one null-visibility overview marker is required."
    );

    if (failures === 0) {
      const counts = Object.fromEntries(
        [...VALID_CATEGORIES].map((category) => [
          category,
          locations.filter((location) => location.category === category).length
        ])
      );
      console.log(`✓ Validated ${locations.length} campus locations.`);
      console.log(`✓ Category counts: ${JSON.stringify(counts)}`);
      console.log(
        `✓ Visibility counts: ${JSON.stringify({
          "zoom-dependent": locations.filter(
            (location) => location.visibility === "zoom-dependent"
          ).length,
          "search-only": locations.filter((location) => location.visibility === "search-only")
            .length,
          always: locations.filter((location) => location.visibility === "always").length,
          null: locations.filter((location) => location.visibility === null).length
        })}`
      );
      console.log(
        `✓ Zoom tiers: ${JSON.stringify(
          Object.fromEntries(
            [16, 17, 18, 19].map((zoom) => [
              zoom,
              locations.filter((location) => location.minZoom === zoom).length
            ])
          )
        )}`
      );
      console.log(
        `✓ Direction modes: ${JSON.stringify({
          walking: locations.filter((location) => location.directions.includes("walking")).length,
          driving: locations.filter((location) => location.directions.includes("driving")).length
        })}`
      );
    }
  }
} catch (error) {
  fail(error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : error.message);
}

if (failures > 0) {
  console.error(`\n${failures} validation error${failures === 1 ? "" : "s"} found.`);
  process.exitCode = 1;
}
