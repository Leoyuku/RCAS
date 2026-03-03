/**
 * @fileoverview This file is the master entry point for the entire `internals` module, which is a port
 * of the Sofie `@mos-connection/model` package. It aggregates and re-exports all the public-facing
 * types, interfaces, enums, and factory functions from the constituent modules.
 *
 * By exporting everything from a single point, it provides a clean, unified public API for the
 * rest of the `mos-connection` module to consume.
 *
 * It exports:
 * - The `getMosTypes` factory and all related types from `mosTypes.ts`.
 * - All the core MOS data model interfaces from `model.ts`.
 * - The XML parsing types from `xmlParse.ts`.
 * - The `pad` utility function from `mosTypes/lib.ts`, as per the original Sofie design.
 */

export * from './mosTypes'
export * from './model'
export * from './xmlParse'
export { pad } from './mosTypes/lib'
