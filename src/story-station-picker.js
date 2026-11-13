const normalize = (value) => String(value)
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLocaleLowerCase("fr")
  .replace(/[’'\-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** Searchable station choice. onSelect receives a string id after an explicit
 * choice; setValue synchronises a scatterplot selection without firing it. */
export function createStationPicker(container, stations, selectedId, onSelect) {
  const items = stations.map(station => ({
    id: String(station.id),
    name: station.name,
    search: normalize(station.name),
  }));
  const byId = new Map(items.map(station => [station.id, station]));
  const shortcutNames = ["Châtelet", "République", "Gare de Lyon"];
  const shortcuts = shortcutNames
    .map(name => items.find(station => station.search === normalize(name)))
    .filter(Boolean);
  const initialSuggestions = [...shortcuts, ...items.filter(station => !shortcuts.includes(station))];
  let selected = byId.get(String(selectedId));
  let visible = [];
  let activeIndex = -1;
  let isOpen = false;
  const events = new AbortController();
  const listen = (element, event, callback) =>
    element.addEventListener(event, callback, { signal: events.signal });
  const prefix = container.id || "station-picker";

  container.innerHTML = `
    <div class="station-picker-search">
      <label class="station-picker-label">Explorer une station</label>
      <input class="station-picker-input" type="search" role="combobox"
        aria-autocomplete="list" aria-expanded="false" autocomplete="off"
        spellcheck="false" placeholder="Nom d’une station" />
      <ul class="station-picker-results" role="listbox" aria-label="Stations proposées" hidden></ul>
    </div>
    <span class="sr-only station-picker-help">Saisissez un nom. Utilisez les flèches pour parcourir les propositions, puis Entrée pour choisir.</span>
    <span class="sr-only station-picker-status" role="status" aria-live="polite"></span>
    <div class="station-picker-shortcuts" role="group" aria-label="Accès rapides aux stations"></div>`;
  const input = container.querySelector(".station-picker-input");
  const label = container.querySelector(".station-picker-label");
  const list = container.querySelector(".station-picker-results");
  const help = container.querySelector(".station-picker-help");
  const status = container.querySelector(".station-picker-status");
  const shortcutGroup = container.querySelector(".station-picker-shortcuts");
  input.id = prefix + "-input";
  label.htmlFor = input.id;
  list.id = prefix + "-results";
  help.id = prefix + "-help";
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-describedby", help.id);

  function close(restore = true) {
    isOpen = false;
    activeIndex = -1;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    if (restore) input.value = selected?.name || "";
    status.textContent = "";
  }

  function setActive(index) {
    activeIndex = index;
    for (const [i, option] of [...list.querySelectorAll("[role=option]")].entries()) {
      option.classList.toggle("is-active", i === activeIndex);
      option.setAttribute("aria-selected", String(i === activeIndex));
    }
    const active = list.querySelector(".is-active");
    if (active) {
      input.setAttribute("aria-activedescendant", active.id);
      // Keep keyboard navigation inside the list. scrollIntoView also moves
      // ancestor scrollers, including the page, even when focus stays here.
      const top = active.offsetTop;
      const bottom = top + active.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    } else input.removeAttribute("aria-activedescendant");
  }

  function open(query = "") {
    const search = normalize(query);
    const words = search.split(" ").filter(Boolean);
    const matches = search
      ? items.filter(station => words.every(word => station.search.includes(word)))
        .sort((a, b) => Number(b.search.startsWith(search)) - Number(a.search.startsWith(search)) ||
          a.name.localeCompare(b.name, "fr"))
      : initialSuggestions;
    visible = matches.slice(0, 6);
    list.replaceChildren();
    for (const [index, station] of visible.entries()) {
      const option = document.createElement("li");
      option.className = "station-picker-option";
      option.id = prefix + "-option-" + index;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.dataset.stationId = station.id;
      option.textContent = station.name;
      list.append(option);
    }
    if (!visible.length) {
      const empty = document.createElement("li");
      empty.className = "station-picker-empty";
      empty.setAttribute("role", "presentation");
      empty.textContent = "Aucune station trouvée";
      list.append(empty);
    }
    isOpen = true;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setActive(-1);
    status.textContent = matches.length
      ? visible.length + " proposition" + (visible.length > 1 ? "s" : "") +
        (matches.length > visible.length ? " sur " + matches.length + ". Précisez votre recherche." : ".")
      : "Aucune station trouvée.";
  }

  function setValue(id) {
    const station = byId.get(String(id));
    if (!station) return false;
    selected = station;
    close();
    for (const button of shortcutGroup.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.stationId === station.id));
    }
    return true;
  }

  function choose(id) {
    if (setValue(id)) onSelect(String(id));
  }

  for (const station of shortcuts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "station-picker-shortcut";
    button.dataset.stationId = station.id;
    button.textContent = station.name;
    button.setAttribute("aria-pressed", "false");
    listen(button, "pointerdown", event => {
      if (event.button !== 0) return;
      // Selection updates the inspector in place; native pointer focus must
      // not scroll the document to the button before that update.
      event.preventDefault();
      button.focus({ preventScroll: true });
    });
    listen(button, "click", () => choose(station.id));
    shortcutGroup.append(button);
  }
  shortcutGroup.hidden = !shortcuts.length;
  listen(input, "focus", () => {
    open();
    input.select();
  });
  listen(input, "click", () => {
    if (!isOpen) {
      open(input.value === selected?.name ? "" : input.value);
      input.select();
    }
  });
  listen(input, "input", () => open(input.value));
  listen(input, "blur", () => close());
  // Keep focus on the combobox while choosing an option with mouse or touch.
  listen(list, "pointerdown", event => event.preventDefault());
  listen(list, "click", event => {
    const option = event.target.closest("[data-station-id]");
    if (option && list.contains(option)) choose(option.dataset.stationId);
  });
  listen(input, "keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) open(input.value === selected?.name ? "" : input.value);
      if (visible.length) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = activeIndex < 0
          ? (step === 1 ? 0 : visible.length - 1)
          : (activeIndex + step + visible.length) % visible.length;
        setActive(next);
      }
    } else if (event.key === "Enter" && isOpen) {
      const choice = activeIndex >= 0
        ? visible[activeIndex]
        : visible.find(station => station.search === normalize(input.value));
      if (choice) {
        event.preventDefault();
        choose(choice.id);
      }
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") close();
  });
  setValue(selectedId);

  return {
    setValue,
    destroy() { events.abort(); },
  };
}
