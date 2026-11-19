import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const templates = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/taskTemplates.json', import.meta.url)), 'utf8'),
);

export const CATEGORIES = ['documents', 'equipment', 'training', 'access', 'introductions'];
export const ASSIGNEE_ROLES = ['hr', 'it', 'manager', 'employee'];

const CITY_TO_COUNTRY = {
  bangalore: 'India',
  bengaluru: 'India',
  mumbai: 'India',
  'new york': 'US',
  'new york city': 'US',
  nyc: 'US',
  london: 'UK',
  toronto: 'Canada',
};

const COUNTRY_ALIASES = {
  india: 'India',
  us: 'US',
  usa: 'US',
  'united states': 'US',
  uk: 'UK',
  'united kingdom': 'UK',
  canada: 'Canada',
};

export const LOCATION_SCOPE_BY_COUNTRY = {
  India: 'india',
  US: 'us',
  Canada: 'canada_uk',
  UK: 'canada_uk',
};

// Ordered keyword rules; a role can carry several tags (e.g. "Engineering Manager").
const ROLE_RULES = [
  ['intern', /\b(intern|internship|trainee)\b/i],
  ['manager', /\b(manager|director|head of|vp|vice president)\b/i],
  ['engineering', /\b(engineer|developer|devops|sre|architect|programmer|sde|qa)\b/i],
  ['sales', /\b(sales|account executive|business development)\b/i],
  ['design', /\b(designer|ux|ui)\b/i],
  ['hr', /\b(hr|human resources|recruiter|people ops)\b/i],
  ['finance', /\b(finance|financial|accountant|accounting)\b/i],
  ['marketing', /\b(marketing|content|growth)\b/i],
  ['analytics', /\b(analyst|data scientist|analytics)\b/i],
];

export function normalizeLocation(location) {
  const key = String(location ?? '').trim().toLowerCase();
  const country = CITY_TO_COUNTRY[key] ?? COUNTRY_ALIASES[key] ?? null;
  return { country, known: country !== null, scope: country ? LOCATION_SCOPE_BY_COUNTRY[country] : null };
}

export function classifyRole(role) {
  const text = String(role ?? '');
  const tags = ROLE_RULES.filter(([, re]) => re.test(text)).map(([tag]) => tag);
  return { tags, known: tags.length > 0 };
}

export function getTemplates() {
  return templates;
}

function matches(template, { country, tags, department }) {
  const { locations, roles, departments } = template.applies_to;
  if (locations.length && !(country && locations.includes(country))) return false;
  if (roles.length && !roles.some((r) => tags.includes(r))) return false;
  if (departments.length && !departments.map((d) => d.toLowerCase()).includes(department)) return false;
  if ((template.excludes_roles ?? []).some((r) => tags.includes(r))) return false;
  return true;
}

/**
 * Deterministic mandatory tasks for a profile. Never throws: unknown role or
 * location falls back to the generic baseline and flags every task for review.
 */
export function getRequiredTasks({ role, location, department }) {
  const { country, known: locationKnown } = normalizeLocation(location);
  const { tags, known: roleKnown } = classifyRole(role);
  const dept = String(department ?? '').trim().toLowerCase();

  const selected = templates.filter((t) => matches(t, { country, tags, department: dept }));
  const ids = new Set(selected.map((t) => t.id));

  // A replacement template (e.g. intern loaner laptop) takes over the original's dependents.
  const remap = Object.fromEntries(selected.filter((t) => t.replaces).map((t) => [t.replaces, t.id]));

  const reviewReasons = [];
  if (!roleKnown) reviewReasons.push('Unknown role');
  if (!locationKnown) reviewReasons.push('Unknown location');

  return selected
    .map((t) => {
      const dependsOn = [...new Set(t.depends_on.map((d) => remap[d] ?? d))].filter(
        (d) => ids.has(d) && d !== t.id,
      );
      const reasons = [...reviewReasons];
      if (t.legal) reasons.push('Legal/compliance task: HR must verify');
      return {
        ...t,
        depends_on: dependsOn,
        confidence: reviewReasons.length ? 0.45 : 1,
        requires_review: reasons.length > 0,
        review_reason: reasons.length ? reasons.join('; ') : null,
      };
    })
    .sort((a, b) => a.due_offset_days - b.due_offset_days || a.priority - b.priority);
}

export function describeProfile({ role, location }) {
  const loc = normalizeLocation(location);
  const r = classifyRole(role);
  return { country: loc.country, locationScope: loc.scope, roleTags: r.tags, roleKnown: r.known, locationKnown: loc.known };
}
