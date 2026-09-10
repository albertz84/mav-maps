(() => {
  "use strict";

  const CAMPUS_CENTER = { lat: 29.74075, lng: -95.43035 };
  const CATEGORY_COLORS = {
    classroom: "#4F46E5",
    restroom: "#0D9488",
    office: "#DC2626",
    facility: "#D97706",
    sports: "#16A34A",
    parking: "#6B7280",
    dining: "#EA580C"
  };
  const CATEGORY_LABELS = {
    classroom: "Classroom",
    restroom: "Restroom",
    office: "Office",
    facility: "Facility",
    sports: "Sports",
    parking: "Parking",
    dining: "Dining"
  };

  const elements = {
    toolbar: document.querySelector(".toolbar"),
    searchToggle: document.querySelector("#search-toggle"),
    search: document.querySelector("#location-search"),
    clearSearch: document.querySelector("#clear-search"),
    results: document.querySelector("#search-results"),
    filters: Array.from(document.querySelectorAll(".filter-button")),
    status: document.querySelector("#map-status"),
    recenter: document.querySelector("#recenter-button")
  };

  const state = {
    map: null,
    infoWindow: null,
    AdvancedMarkerElement: null,
    CollisionBehavior: null,
    locations: [],
    markers: new Map(),
    activeCategory: "all",
    searchPanelExpanded: false,
    searchIsOpen: false,
    selectedResultIndex: -1,
    userMarker: null,
    userPosition: null,
    geolocationWatchId: null
  };

  function normalizeSearchText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function locationMatches(location) {
    if (state.activeCategory !== "all" && location.category !== state.activeCategory) {
      return false;
    }

    const query = normalizeSearchText(elements.search.value);
    if (!query) {
      return true;
    }

    const searchableText = normalizeSearchText(
      [location.name, location.building, location.description, ...location.tags].join(" ")
    );
    return searchableText.includes(query);
  }

  // The admin editor can add markerDisplay without rewriting legacy records.
  // Existing data keeps using visibility until it is explicitly edited.
  function markerDisplayMode(location) {
    return location.markerDisplay || location.visibility;
  }

  function matchingLocations() {
    return state.locations.filter(locationMatches);
  }

  function setStatus(title, message) {
    elements.status.innerHTML = "";
    const heading = document.createElement("strong");
    heading.textContent = title;
    const details = document.createElement("span");
    details.textContent = message;
    elements.status.append(heading, details);
    elements.status.hidden = false;
  }

  function clearStatus() {
    elements.status.hidden = true;
    elements.status.textContent = "";
  }

  async function loadLocations() {
    const response = await fetch("data/locations.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Campus data request failed with status ${response.status}`);
    }

    const locations = await response.json();
    if (!Array.isArray(locations)) {
      throw new TypeError("Campus data must be an array.");
    }
    state.locations = locations;
  }

  function loadGoogleMaps(apiKey) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const callbackName = "__sjsGoogleMapsReady";
      const parameters = new URLSearchParams({
        key: apiKey,
        v: "weekly",
        loading: "async",
        libraries: "marker",
        callback: callbackName
      });
      window[callbackName] = () => {
        delete window[callbackName];
        resolve();
      };
      script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`;
      script.async = true;
      script.onerror = () => {
        delete window[callbackName];
        reject(new Error("Google Maps JavaScript API failed to load."));
      };
      document.head.append(script);
    });
  }

  async function initializeMap() {
    const [{ Map, InfoWindow }, { AdvancedMarkerElement, CollisionBehavior }] = await Promise.all([
      google.maps.importLibrary("maps"),
      google.maps.importLibrary("marker")
    ]);

    state.AdvancedMarkerElement = AdvancedMarkerElement;
    state.CollisionBehavior = CollisionBehavior;
    state.map = new Map(document.querySelector("#map"), {
      center: CAMPUS_CENTER,
      zoom: 18,
      mapId: window.SJS_MAP_CONFIG.mapId || "DEMO_MAP_ID",
      mapTypeId: "satellite",
      mapTypeControl: true,
      mapTypeControlOptions: {
        mapTypeIds: ["satellite", "roadmap"],
        position: google.maps.ControlPosition.LEFT_BOTTOM,
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR
      },
      cameraControl: false,
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_CENTER
      },
      streetViewControl: false,
      fullscreenControl: false,
      rotateControl: false,
      scaleControl: true,
      clickableIcons: false,
      gestureHandling: "greedy",
      keyboardShortcuts: true,
      tilt: 0
    });

    state.infoWindow = new InfoWindow({ maxWidth: 320 });
    createLocationMarkers();
    state.map.addListener("zoom_changed", updateVisibleMarkers);
    updateVisibleMarkers();
    startGeolocation();
    clearStatus();
  }

  function createLocationMarkers() {
    state.locations.forEach((location) => {
      const displayMode = markerDisplayMode(location);
      if (["search-only", "event-only", "hidden"].includes(displayMode)) {
        return;
      }

      const content = document.createElement("div");
      content.className = "location-marker";
      content.textContent = location.name;
      content.style.setProperty("--category-color", CATEGORY_COLORS[location.category]);

      const marker = new state.AdvancedMarkerElement({
        map: state.map,
        position: { lat: location.lat, lng: location.lng },
        title: location.name,
        content,
        gmpClickable: true,
        zIndex:
          location.visibility === null
            ? 10000
            : location.name === "Admissions Office"
              ? 9000
              : markerPriority(location),
        collisionBehavior:
          location.visibility === null || displayMode === "always"
            ? state.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
            : state.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
      });

      marker.addListener("click", () => openLocation(location));
      state.markers.set(location.id, marker);
    });
  }

  function markerPriority(location) {
    const categoryPriority = {
      parking: 500,
      facility: 450,
      sports: 400,
      dining: 350,
      office: 300,
      restroom: 250,
      classroom: 200
    };
    return categoryPriority[location.category] + (1000 - location.id);
  }

  function updateVisibleMarkers() {
    if (!state.map) {
      return;
    }
    const currentZoom = state.map.getZoom() || 0;
    state.locations.forEach((location) => {
      const marker = state.markers.get(location.id);
      if (!marker) {
        return;
      }
      const minimumZoom = Number.isFinite(location.minZoom) ? location.minZoom : 18;
      const displayMode = markerDisplayMode(location);
      const zoomAllowsMarker =
        location.visibility === null
          ? currentZoom < (Number.isFinite(location.maxZoom) ? location.maxZoom : 16)
          : displayMode === "always" || currentZoom >= minimumZoom;
      marker.map = zoomAllowsMarker && locationMatches(location) ? state.map : null;
    });
  }

  function renderSearchResults() {
    const query = elements.search.value.trim();
    const matches = matchingLocations();
    elements.results.innerHTML = "";
    state.selectedResultIndex = -1;

    if (!state.searchIsOpen || !query) {
      elements.results.hidden = true;
      elements.search.setAttribute("aria-expanded", "false");
      return;
    }

    if (matches.length === 0) {
      const message = document.createElement("p");
      message.className = "no-results";
      message.textContent = `No results found for “${query}”`;
      elements.results.append(message);
    } else {
      matches.slice(0, 30).forEach((location, index) => {
        const result = document.createElement("button");
        result.type = "button";
        result.className = "search-result";
        result.setAttribute("role", "option");
        result.dataset.locationId = String(location.id);
        result.dataset.resultIndex = String(index);
        result.setAttribute("aria-selected", "false");

        const dot = document.createElement("span");
        dot.className = "result-dot";
        dot.style.setProperty("--category-color", CATEGORY_COLORS[location.category]);
        dot.setAttribute("aria-hidden", "true");

        const name = document.createElement("span");
        name.className = "result-name";
        name.textContent = location.name;

        const building = document.createElement("span");
        building.className = "result-building";
        building.textContent = location.building;

        result.append(dot, name, building);
        result.addEventListener("click", () => selectSearchResult(location));
        elements.results.append(result);
      });
    }

    elements.results.hidden = false;
    elements.search.setAttribute("aria-expanded", "true");
  }

  function selectSearchResult(location) {
    state.searchIsOpen = false;
    elements.search.value = "";
    elements.clearSearch.hidden = true;
    renderSearchResults();
    updateVisibleMarkers();
    setSearchExpanded(false);
    openLocation(location, true);
  }

  function openLocation(location, focusMap = false) {
    if (!state.map || !state.infoWindow) {
      return;
    }

    const marker = state.markers.get(location.id);
    state.map.panTo({ lat: location.lat, lng: location.lng });
    if (focusMap) {
      state.map.setZoom(Math.max(state.map.getZoom() || 17, 19));
    }

    const content = buildInfoWindow(location);
    state.infoWindow.setContent(content);
    if (marker) {
      state.infoWindow.open({ map: state.map, anchor: marker, shouldFocus: false });
    } else {
      state.infoWindow.setPosition({ lat: location.lat, lng: location.lng });
      state.infoWindow.open({ map: state.map, shouldFocus: false });
    }
  }

  function buildInfoWindow(location) {
    const wrapper = document.createElement("article");
    wrapper.className = "info-window";
    wrapper.style.setProperty("--category-color", CATEGORY_COLORS[location.category]);

    const category = document.createElement("p");
    category.className = "info-category";
    category.textContent = CATEGORY_LABELS[location.category];

    const title = document.createElement("h2");
    title.className = "info-title";
    title.textContent = location.name;

    const meta = document.createElement("p");
    meta.className = "info-meta";
    const floorLabel = location.floor > 0 ? ` · Floor ${location.floor}` : "";
    meta.textContent = `${location.building}${floorLabel}`;

    const description = document.createElement("p");
    description.className = "info-description";
    description.textContent = location.description;

    const directionActions = document.createElement("div");
    directionActions.className = "directions-actions";
    const enabledDirections = Array.isArray(location.directions)
      ? location.directions
      : ["walking"];

    enabledDirections.forEach((mode) => {
      const directions = document.createElement("a");
      directions.className = "directions-button";
      directions.href = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}&travelmode=${mode}`;
      directions.target = "_blank";
      directions.rel = "noopener noreferrer";
      directions.textContent = `Get ${mode} directions`;
      directions.setAttribute("aria-label", `Get ${mode} directions to ${location.name}`);
      directionActions.append(directions);
    });

    wrapper.append(category, title, meta, description, directionActions);
    return wrapper;
  }

  function clearSearch() {
    elements.search.value = "";
    elements.clearSearch.hidden = true;
    state.searchIsOpen = false;
    renderSearchResults();
    updateVisibleMarkers();
  }

  function setSearchExpanded(expanded, focusInput = false) {
    state.searchPanelExpanded = expanded;
    elements.toolbar.classList.toggle("search-expanded", expanded);
    elements.searchToggle.setAttribute("aria-expanded", String(expanded));
    elements.searchToggle.setAttribute(
      "aria-label",
      expanded ? "Search campus locations" : "Open campus search"
    );

    if (!expanded) {
      state.searchIsOpen = false;
      renderSearchResults();
    } else if (focusInput) {
      window.requestAnimationFrame(() => elements.search.focus());
    }
  }

  function setActiveFilter(button) {
    state.activeCategory = button.dataset.category;
    elements.filters.forEach((filter) => {
      const isActive = filter === button;
      filter.classList.toggle("active", isActive);
      filter.setAttribute("aria-checked", String(isActive));
    });
    updateVisibleMarkers();
    renderSearchResults();
  }

  function moveResultSelection(direction) {
    const options = Array.from(elements.results.querySelectorAll(".search-result"));
    if (options.length === 0) {
      return;
    }

    state.selectedResultIndex =
      (state.selectedResultIndex + direction + options.length) % options.length;
    options.forEach((option, index) => {
      option.setAttribute("aria-selected", String(index === state.selectedResultIndex));
    });
    options[state.selectedResultIndex].scrollIntoView({ block: "nearest" });
  }

  function startGeolocation() {
    if (!navigator.geolocation || state.geolocationWatchId !== null) {
      return;
    }

    state.geolocationWatchId = navigator.geolocation.watchPosition(
      handleGeolocationSuccess,
      (error) => console.info("Campus map geolocation unavailable:", error.message),
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000
      }
    );
  }

  function handleGeolocationSuccess(position) {
    state.userPosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };

    if (!state.userMarker) {
      const content = document.createElement("div");
      content.className = "gps-marker";
      content.setAttribute("aria-label", "Your current location");
      state.userMarker = new state.AdvancedMarkerElement({
        map: state.map,
        position: state.userPosition,
        title: "You are here",
        content,
        zIndex: 10000
      });
      elements.recenter.hidden = false;
    } else {
      state.userMarker.position = state.userPosition;
    }
  }

  function bindInterfaceEvents() {
    elements.searchToggle.addEventListener("click", () => {
      if (!state.searchPanelExpanded) {
        setSearchExpanded(true, true);
      } else {
        elements.search.focus();
      }
    });

    elements.search.addEventListener("input", () => {
      elements.clearSearch.hidden = elements.search.value.length === 0;
      state.searchIsOpen = elements.search.value.trim().length > 0;
      updateVisibleMarkers();
      renderSearchResults();
    });

    elements.search.addEventListener("focus", () => {
      setSearchExpanded(true);
      if (elements.search.value.trim()) {
        state.searchIsOpen = true;
        renderSearchResults();
      }
    });

    elements.search.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        clearSearch();
        setSearchExpanded(false);
        elements.searchToggle.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveResultSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveResultSelection(-1);
      } else if (event.key === "Enter" && state.selectedResultIndex >= 0) {
        event.preventDefault();
        const selected = elements.results.querySelector('[aria-selected="true"]');
        const location = state.locations.find(
          (item) => item.id === Number(selected?.dataset.locationId)
        );
        if (location) {
          selectSearchResult(location);
        }
      }
    });

    elements.clearSearch.addEventListener("click", () => {
      clearSearch();
      elements.search.focus();
    });

    elements.filters.forEach((button) => {
      button.addEventListener("click", () => setActiveFilter(button));
    });

    document.addEventListener("pointerdown", (event) => {
      if (!elements.toolbar.contains(event.target)) {
        state.searchIsOpen = false;
        renderSearchResults();
        if (!elements.search.value.trim()) {
          setSearchExpanded(false);
        }
      }
    });

    elements.recenter.addEventListener("click", () => {
      if (state.userPosition && state.map) {
        state.map.panTo(state.userPosition);
        state.map.setZoom(19);
      }
    });

    window.addEventListener(
      "pagehide",
      () => {
        if (state.geolocationWatchId !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(state.geolocationWatchId);
          state.geolocationWatchId = null;
        }
      },
      { once: true }
    );
  }

  async function bootstrap() {
    bindInterfaceEvents();

    try {
      await loadLocations();
    } catch (error) {
      console.error(error);
      setStatus(
        "Campus data could not load",
        "Serve this folder through a local web server, then refresh the page."
      );
      return;
    }

    const apiKey = window.SJS_MAP_CONFIG?.apiKey?.trim();
    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
      setStatus(
        "Google Maps API key needed",
        "Replace YOUR_API_KEY_HERE in index.html. Search and filters are ready; the map will appear after you add the key."
      );
      return;
    }

    try {
      await loadGoogleMaps(apiKey);
      await initializeMap();
    } catch (error) {
      console.error(error);
      setStatus(
        "The map could not load",
        "Check that the Maps JavaScript API is enabled and that this domain is allowed by your API key restrictions."
      );
    }
  }

  window.gm_authFailure = () => {
    setStatus(
      "Google Maps authorization failed",
      "Check the API key, billing, enabled APIs, and website restrictions in Google Cloud Console."
    );
  };

  bootstrap();
})();
