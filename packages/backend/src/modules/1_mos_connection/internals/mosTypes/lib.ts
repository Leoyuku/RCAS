/**
 * @fileoverview This is a utility library file, ported directly from Sofie.
 * It provides helper functions used by other mosTypes modules.
 *
 * This file is a prerequisite for mosTime.ts.
 */

/**
 * Pads a number or string with a character (defaulting to '0') to ensure it
 * reaches a minimum width. Crucial for formatting time and date components.
 *
 * @param n The number or string to pad.
 * @param width The minimum desired width.
 * @param z The character to pad with (defaults to '0').
 * @returns The padded string.
 */
export function pad(n: string | number, width: number, z?: string): string {
	z = z ?? '0'
	n = '' + n
	return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n
}
