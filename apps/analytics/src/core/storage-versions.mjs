/** Product releases and persisted formats deliberately have separate identities. */
export const PRODUCT_VERSION='1.3.1';
export const STORAGE_FORMAT_VERSION=2;
export const NORMALIZED_SCHEMA_VERSION=2;
export const LEGACY_STORAGE_OWNER='threadshelf-local-analytics:1';
export const V2_STORAGE_OWNER='threadshelf-local-analytics:2:namespace';
export const TEXT_INDEX_ALGORITHM_VERSION='owned-text:2';
export const TEXT_INDEX_SCHEMA_VERSION=2;
export const SUPPORTED_CAPTURE_VERSIONS=Object.freeze({adapter:new Set(['1.0.0','2.0.0']),content:new Set(['1.0.0','2.0.0'])});
export function supportedCapture(data){return !!data&&SUPPORTED_CAPTURE_VERSIONS.adapter.has(data.adapterVersion)&&SUPPORTED_CAPTURE_VERSIONS.content.has(data.contentVersion)&&data.source&&Array.isArray(data.conversations)&&data.conversations.every(c=>typeof c.id==='string'&&Array.isArray(c.records));}
