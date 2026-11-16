import taxonomy from '../../content/taxonomy/cissp-cbk-2026.json';
import type { MemoryDomainMeta } from '../types/memory';

/** Taxonomy slice (domains + sub-domain names) passed into the memorization islands. */
export function getMemoryDomainMeta(): MemoryDomainMeta[] {
  return taxonomy.domains.map((d) => ({
    domainId: d.domainId,
    number: d.number,
    name: d.name,
    shortName: d.shortName,
    color: d.color,
    weightPercent: d.weightPercent,
    subdomains: d.subdomains.map((s) => ({ subdomainId: s.subdomainId, name: s.name })),
  }));
}
