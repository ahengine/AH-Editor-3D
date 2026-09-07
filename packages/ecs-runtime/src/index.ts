/* Runtime-safe editor kernel: traits, registry, serialization, loading.
 * No editor UI imports allowed from here. */

export * from './traits.js'
export * from './relations.js'
export * from './registry.js'
export * from './serialize.js'
export * from './prefabs.js'
export * from './asset-cache.js'
export * from './material-graph/index.js'
export * from './animation-clip.js'
export { UrlAssetResolver, PassthroughResolver, modelAnimations, rememberModelAnimations } from './assets.js'
export * from './materials.js'
export * from './animation.js'
export * from './loader.js'
