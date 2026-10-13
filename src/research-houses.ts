export type House = {id: string; name: string; shortName: string; aliases: string[]; archived: boolean};
export type HouseInput = {name: string; shortName?: string; aliases?: string[]; archived?: boolean};
const clean = (v: string) => String(v || '').replace(/[\u2066-\u2069]/g, '').trim().replace(/\s+/g, ' ');
const key = (v: string) => clean(v).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/[\u064b-\u065fـ]/g, '');
function validName(v: string) {
  if (!v || v.length > 100 || !/^[\p{L}\p{N} .&()_\-]+$/u.test(v) || ['__proto__','constructor','prototype'].includes(v))
    throw Error('أدخل اسمًا صالحًا لبيت الخبرة دون رموز برمجية');
}
export function resolveHouse(registry: House[], value: string): House | undefined {
  return registry.find(h => [h.name, h.shortName, ...h.aliases].some(n => n && key(n) === key(value)));
}
export function saveHouse(registry: House[], id: string | null, input: HouseInput): House[] {
  const old = id ? registry.find(h => h.id === id) : undefined;
  if (id && !old) throw Error('بيت الخبرة غير موجود');
  const name = clean(input.name), shortName = clean(input.shortName || '');
  const aliases = [...new Set([...(input.aliases || []).map(clean).filter(Boolean), ...(old && old.name !== name ? [old.name, ...old.aliases] : [])])].filter(n => key(n) !== key(name));
  for (const value of [name, ...(shortName ? [shortName] : []), ...aliases]) {
    validName(value);
    if (registry.some(h => h.id !== id && [h.name,h.shortName,...h.aliases].some(n => n && key(n) === key(value))))
      throw Error('هذا الاسم أو الاختصار موجود لبيت خبرة آخر');
  }
  const record: House = {id: old?.id || 'house-' + encodeURIComponent(name), name, shortName, aliases, archived: input.archived ?? old?.archived ?? false};
  return old ? registry.map(h => h.id === id ? record : h) : [...registry, record];
}
export function createRegistry(defaults: string[], saved: House[] = [], discovered: string[] = []): House[] {
  let result: House[] = [];
  if (!Array.isArray(saved)) throw Error('سجل بيوت الخبرة غير صالح');
  for (const entry of saved) {
    if (!entry || !Array.isArray(entry.aliases)) throw Error('سجل بيوت الخبرة غير صالح');
    if (entry.archived != null && typeof entry.archived !== 'boolean') throw Error('حالة الأرشفة غير صالحة');
    result = saveHouse(result, null, entry);
    if (entry.id) {
      if (typeof entry.id !== 'string' || entry.id.length > 1200 || result.slice(0,-1).some(h => h.id === entry.id)) throw Error('معرف بيت الخبرة غير صالح أو مكرر');
      result[result.length-1].id = entry.id;
    }
  }
  for (const name of [...defaults, ...discovered]) if (!resolveHouse(result, name)) result = saveHouse(result, null, {name});
  return result;
}
export function applyRegistry<T extends {forecasts: Record<string, any[]>; provenance?: Record<string, any>}>(state: T, registry: House[]): T {
  const next = structuredClone(state);
  for (const rows of Object.values(next.forecasts).filter(Array.isArray)) for (const row of rows) {
    const mapped: Record<string, number | null> = {};
    for (const [name,value] of Object.entries(row.forecasts || {})) {
      const canonical = resolveHouse(registry,name)?.name || name;
      if (value != null && mapped[canonical] != null && value !== mapped[canonical]) throw Error('تعارض توقعات بيت الخبرة: ' + canonical);
      if (value != null || !(canonical in mapped)) mapped[canonical] = value as number | null;
    }
    row.forecasts = mapped;
  }
  if (next.provenance) {
    const mapped: Record<string, any> = {};
    for (const [field,meta] of Object.entries(next.provenance)) {
      const parts = field.split('|');
      if (parts[2] === 'forecast' && parts[3]) parts[3] = resolveHouse(registry,parts[3])?.name || parts[3];
      mapped[parts.join('|')] = {...meta, ...(meta.expert ? {expert: resolveHouse(registry,meta.expert)?.name || meta.expert} : {})};
    }
    next.provenance = mapped;
  }
  return next;
}
export function mergeRegistry(current: House[], incoming: House[]): House[] {
  const validated = createRegistry([], incoming);
  let result = structuredClone(current);
  for (const house of validated) {
    const old = result.find(h => h.id === house.id) || [house.name,...house.aliases].map(n => resolveHouse(result,n)).find(Boolean);
    result = saveHouse(result, old?.id || null, {...house, aliases:[...house.aliases,...(old?.aliases || [])]});
  }
  return result;
}
