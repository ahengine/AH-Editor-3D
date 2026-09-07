import * as THREE from 'three'
import { MeshBasicNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import type { MaterialDefinition } from '@ahengine/project-schema'
import { sharedAssetCache, type AssetResolver, type AssetCache } from './asset-cache.js'

/**
 * Material service: MaterialDefinition (data) → THREE NodeMaterial (GPU).
 *
 * WebGPU-first — only Node materials are used so everything stays compatible
 * with the TSL material graphs that will augment plain properties later.
 */

type MapSlot = 'map' | 'metalnessMap' | 'roughnessMap' | 'normalMap' | 'emissiveMap'

export class MaterialService {
  private materials = new Map<string, THREE.Material>()
  private loading = new Set<string>()

  constructor(
    private definitions: () => Map<string, MaterialDefinition>,
    private resolver?: AssetResolver,
    private resolveAsset?: (id: string) => { uri: string } | undefined,
    private cache: AssetCache = sharedAssetCache
  ) {}

  /** Returns a live material instance, building it on first use. */
  get(materialId: string | null | undefined): THREE.Material | undefined {
    if (!materialId) return undefined
    if (this.materials.has(materialId)) return this.materials.get(materialId)
    const def = this.definitions().get(materialId)
    if (!def) return undefined
    const material = this.build(def)
    this.materials.set(materialId, material)
    return material
  }

  /** Rebuilds a material after its definition changed; the viewport updates next frame. */
  update(materialId: string): void {
    const def = this.definitions().get(materialId)
    if (!def) return
    const existing = this.materials.get(materialId)
    this.materials.set(materialId, this.build(def))
    if (existing) existing.dispose()
  }

  remove(materialId: string): void {
    this.materials.get(materialId)?.dispose()
    this.materials.delete(materialId)
  }

  private build(def: MaterialDefinition): THREE.Material {
    const p = def.properties
    const material =
      def.type === 'unlit'
        ? new MeshBasicNodeMaterial()
        : def.type === 'physical'
          ? new MeshPhysicalNodeMaterial()
          : new MeshStandardNodeMaterial()

    const anyMaterial = material as unknown as Record<string, unknown>
    if (p.baseColor !== undefined && 'color' in anyMaterial) {
      ;(anyMaterial.color as THREE.Color).set(p.baseColor)
    }
    if (p.metalness !== undefined) anyMaterial.metalness = p.metalness
    if (p.roughness !== undefined) anyMaterial.roughness = p.roughness
    if (p.emissive !== undefined && 'emissive' in anyMaterial) {
      ;(anyMaterial.emissive as THREE.Color).set(p.emissive)
    }
    if (p.emissiveIntensity !== undefined) anyMaterial.emissiveIntensity = p.emissiveIntensity
    if (p.opacity !== undefined) material.opacity = p.opacity
    if (p.transparent !== undefined) material.transparent = p.transparent
    if (p.alphaTest !== undefined && p.alphaTest > 0) {
      material.alphaTest = p.alphaTest
      material.transparent = false
    }
    if (p.side !== undefined) {
      material.side =
        p.side === 'double' ? THREE.DoubleSide : p.side === 'back' ? THREE.BackSide : THREE.FrontSide
    }
    material.userData.normalScale = p.normalScale

    if (p.baseColorTexture) this.attachMap(material, 'map', p.baseColorTexture, 'srgb', def)
    if (p.metalnessTexture) this.attachMap(material, 'metalnessMap', p.metalnessTexture, undefined, def)
    if (p.roughnessTexture) this.attachMap(material, 'roughnessMap', p.roughnessTexture, undefined, def)
    if (p.normalTexture) this.attachMap(material, 'normalMap', p.normalTexture, undefined, def)
    if (p.emissiveTexture) this.attachMap(material, 'emissiveMap', p.emissiveTexture, 'srgb', def)

    return material
  }

  private attachMap(
    material: THREE.Material,
    slot: MapSlot,
    assetId: string,
    colorSpace: 'srgb' | undefined,
    def: MaterialDefinition
  ): void {
    if (!this.resolver || !this.resolveAsset) return
    if (this.loading.has(assetId)) return
    const record = this.resolveAsset(assetId)
    if (!record) return
    this.loading.add(assetId)
    const target = material as unknown as Record<string, unknown>
    this.resolver
      .resolve({ id: assetId, type: 'texture', name: assetId, uri: record.uri })
      .then((url) =>
        colorSpace ? this.cache.loadTexture(url, 'srgb') : this.cache.loadTexture(url)
      )
      .then((texture) => {
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        target[slot] = texture
        if (slot === 'normalMap') {
          const scale = def.properties.normalScale ?? 1
          ;(target.normalScale as THREE.Vector2 | undefined)?.set(scale, scale)
        }
        material.needsUpdate = true
      })
      .catch(() => undefined)
      .finally(() => this.loading.delete(assetId))
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose()
    this.materials.clear()
  }
}

/** Neutral fallback when an entity has no material reference. */
export function createFallbackMaterial(): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial()
  material.color.set('#b8bec7')
  material.metalness = 0.05
  material.roughness = 0.85
  return material
}

export const fallbackMaterial = createFallbackMaterial()
