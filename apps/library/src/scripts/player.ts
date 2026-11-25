/**
 * Placeholder client code: one Player for the visit (the #player element is persisted across page loads), tonight's playlists from /playlists/, and
 * play buttons. The library team replaces this.
 */
import { fetchCurrentEdition, type Playlist } from "@goldstein/playlists";
import { Player, createStore, type Track } from "@goldstein/player";

declare global {
  interface Window {
    goldsteinPlayer?: Player;
  }
}

function player(): Player {
  if (!window.goldsteinPlayer) {
    const audio = new Audio();
    const p = new Player({ audio, store: createStore("library") });
    const toggle = document.querySelector<HTMLButtonElement>("[data-player-toggle]");
    const title = document.querySelector<HTMLElement>("[data-player-title]");
    toggle?.addEventListener("click", () => void p.toggle());
    p.subscribe((s) => {
      if (toggle) toggle.hidden = s.index < 0;
      if (title) title.textContent = s.queue[s.index]?.title ?? "";
    });
    window.goldsteinPlayer = p;
  }
  return window.goldsteinPlayer;
}

const toTracks = (p: Playlist): Track[] =>
  p.items.map((i) => ({
    id: i.id,
    title: i.title,
    url: i.audio_url,
    start_sec: i.start_sec,
    end_sec: i.end_sec,
    artist: i.narrator ?? "",
  }));

async function renderTonight() {
  const list = document.querySelector<HTMLUListElement>("[data-tonight]");
  if (!list || list.dataset["done"]) return;
  list.dataset["done"] = "1";
  const edition = await fetchCurrentEdition();
  if (!edition || edition.playlists.length === 0) {
    list.innerHTML = "<li>No playlists tonight.</li>";
    return;
  }
  list.replaceChildren(
    ...edition.playlists.map((p) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `Play ${p.title}`;
      b.addEventListener("click", () => void player().load(toTracks(p)));
      li.append(
        b,
        ` ${p.subtitle} ${p.items.length} stories, ${p.total_min} min, ages ${p.age_min}+`,
      );
      return li;
    }),
  );
}

function bindPlayButtons() {
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-play-url]")) {
    if (b.dataset["bound"]) continue;
    b.dataset["bound"] = "1";
    b.addEventListener(
      "click",
      () =>
        void player().load([
          {
            id: b.dataset["id"] ?? "",
            title: b.dataset["title"] ?? "",
            url: b.dataset["playUrl"] ?? "",
            start_sec: Number(b.dataset["start"] ?? 0),
            end_sec: Number(b.dataset["end"] ?? 0) || undefined,
          } as Track,
        ]),
    );
  }
}

function init() {
  player();
  void renderTonight();
  bindPlayButtons();
}

init();
document.addEventListener("astro:page-load", init);
