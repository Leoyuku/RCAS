/**
 * @fileoverview Ported from Sofie, this file defines the basic TypeScript types for representing parsed XML data.
 * These types are used to provide a generic structure for XML documents that have been converted into JavaScript objects.
 * It is a prerequisite for mosTypes.ts, which uses AnyXMLValue to type payloads.
 */

/** Parsed xml data objects */
export type AnyXMLObject = { [key: string]: AnyXMLValue }
/** Parsed xml data values */
export type AnyXMLValue = AnyXMLValueSingular | AnyXMLValueSingular[] | AnyXMLObject | AnyXMLObject[]
/** Parsed xml data values, singular */
export type AnyXMLValueSingular = string | undefined
