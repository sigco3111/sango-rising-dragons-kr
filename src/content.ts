import type { Content, FactionDef, CityDef, OfficerDef, SkillDef, ItemDef, EventDef } from './types';

/**
 * Content is loaded from /data/<pack>/*.json packs listed in /data/manifest.json.
 * Later packs override or extend earlier ones by id, so new events, characters,
 * cities and balance tweaks ship as plain JSON — no code changes needed.
 */
export const content: Content = {
  factions: [], cities: [], officers: [], skills: [], items: [], events: [],
};

function mergeById<T extends { id: string }>(base: T[], extra: T[]): T[] {
  const map = new Map(base.map((e) => [e.id, e]));
  for (const e of extra) map.set(e.id, { ...map.get(e.id), ...e });
  return [...map.values()];
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function loadContent(): Promise<Content> {
  const manifest = (await fetchJson<{ packs: string[] }>('data/manifest.json')) ?? { packs: ['base'] };
  for (const pack of manifest.packs) {
    const dir = `data/${pack}`;
    const [factions, cities, officers, skills, items, events] = await Promise.all([
      fetchJson<FactionDef[]>(`${dir}/factions.json`),
      fetchJson<CityDef[]>(`${dir}/cities.json`),
      fetchJson<OfficerDef[]>(`${dir}/officers.json`),
      fetchJson<SkillDef[]>(`${dir}/skills.json`),
      fetchJson<ItemDef[]>(`${dir}/items.json`),
      fetchJson<EventDef[]>(`${dir}/events.json`),
    ]);
    if (factions) content.factions = mergeById(content.factions, factions);
    if (cities) content.cities = mergeById(content.cities, cities);
    if (officers) content.officers = mergeById(content.officers, officers);
    if (skills) content.skills = mergeById(content.skills, skills);
    if (items) content.items = mergeById(content.items, items);
    if (events) content.events = mergeById(content.events, events);
  }
  return content;
}

export const faction = (id: string) => content.factions.find((f) => f.id === id)!;
export const cityDef = (id: string) => content.cities.find((c) => c.id === id)!;
export const officerDef = (id: string) => content.officers.find((o) => o.id === id)!;
export const skillDef = (id: string) => content.skills.find((s) => s.id === id)!;
export const itemDef = (id: string) => content.items.find((i) => i.id === id)!;
