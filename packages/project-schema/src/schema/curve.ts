import { z } from 'zod'
import { hexColor } from './common.js'

/**
 * Reusable Curve and Gradient primitives — pure data, no functions.
 * Used by particle modules and future animation curves.
 */

/* ---- Curve (scalar over time) ---- */

export interface CurveKey {
  time: number
  value: number
  interpolation?: 'step' | 'linear'
}

export const CurveKeySchema = z.object({
  time: z.number().min(0),
  value: z.number(),
  interpolation: z.enum(['step', 'linear']).default('linear'),
})

export interface Curve {
  keys: CurveKey[]
}

export const CurveSchema = z.object({
  keys: z.array(CurveKeySchema).min(1, 'Curve must have at least one key'),
})

/** Samples a curve at time t (linear interpolation between keys). */
export function sampleCurve(curve: Curve, t: number): number {
  const keys = curve.keys
  if (keys.length === 0) return 0
  const sorted = [...keys].sort((a, b) => a.time - b.time)
  if (t <= sorted[0].time) return sorted[0].value
  if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    if (t >= a.time && t <= b.time) {
      if (a.interpolation === 'step') return a.value
      const alpha = (t - a.time) / (b.time - a.time || 1)
      return a.value + (b.value - a.value) * alpha
    }
  }
  return sorted[sorted.length - 1].value
}

/* ---- Gradient (color + alpha over time) ---- */

export interface ColorStop {
  time: number
  color: string
}

export interface AlphaStop {
  time: number
  alpha: number
}

export const ColorStopSchema = z.object({
  time: z.number().min(0),
  color: hexColor,
})

export const AlphaStopSchema = z.object({
  time: z.number().min(0),
  alpha: z.number().min(0).max(1),
})

export interface Gradient {
  colorStops: ColorStop[]
  alphaStops: AlphaStop[]
}

export const GradientSchema = z.object({
  colorStops: z.array(ColorStopSchema).min(1, 'Gradient needs at least one color stop'),
  alphaStops: z.array(AlphaStopSchema).default([{ time: 0, alpha: 1 }]),
})

/** Samples gradient color at time t (lerp between stops). Returns [r,g,b] 0–1. */
export function sampleGradientColor(gradient: Gradient, t: number): [number, number, number] {
  const stops = [...gradient.colorStops].sort((a, b) => a.time - b.time)
  if (stops.length === 0) return [1, 1, 1]
  if (t <= stops[0].time) return hexToRgb(stops[0].color)
  if (t >= stops[stops.length - 1].time) return hexToRgb(stops[stops.length - 1].color)
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1]
    if (t >= a.time && t <= b.time) {
      const alpha = (t - a.time) / (b.time - a.time || 1)
      const ca = hexToRgb(a.color), cb = hexToRgb(b.color)
      return [
        ca[0] + (cb[0] - ca[0]) * alpha,
        ca[1] + (cb[1] - ca[1]) * alpha,
        ca[2] + (cb[2] - ca[2]) * alpha,
      ]
    }
  }
  return hexToRgb(stops[stops.length - 1].color)
}

/** Samples gradient alpha at time t. */
export function sampleGradientAlpha(gradient: Gradient, t: number): number {
  const stops = gradient.alphaStops.length > 0
    ? [...gradient.alphaStops].sort((a, b) => a.time - b.time)
    : [{ time: 0, alpha: 1 }]
  if (t <= stops[0].time) return stops[0].alpha
  if (t >= stops[stops.length - 1].time) return stops[stops.length - 1].alpha
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1]
    if (t >= a.time && t <= b.time) {
      const alpha = (t - a.time) / (b.time - a.time || 1)
      return a.alpha + (b.alpha - a.alpha) * alpha
    }
  }
  return stops[stops.length - 1].alpha
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  if (m.length === 6) {
    return [
      parseInt(m.slice(0, 2), 16) / 255,
      parseInt(m.slice(2, 4), 16) / 255,
      parseInt(m.slice(4, 6), 16) / 255,
    ]
  }
  return [1, 1, 1]
}
