/**
 * @fileoverview This module, a direct port from the Sofie project, defines and manages the MosDuration type.
 * It is responsible for parsing and stringifying time durations in the format required by the MOS protocol (HH:MM:SS).
 * The internal representation of the duration is always in seconds.
 *
 * It depends on the `pad` function from the local `./lib.ts` module to correctly format the output string.
 *
 * Key Functions:
 *
 * 1. Core Definition (`IMOSDuration` interface): Establishes a nominal type for MOS durations, with the raw value stored in seconds.
 *
 * 2. Factory (`create` function): The primary entry point. It can create an IMOSDuration object from either a number (total seconds)
 *    or a string in "HH:MM:SS" format.
 *
 * 3. Stringification (`stringify` function): Converts the internal second count back into the "HH:MM:SS" string format.
 *    It uses the imported `pad` function to ensure the minutes and seconds components are always two digits.
 *
 * 4. Type Guard (`is` function): Provides runtime type safety for reliable validation of IMOSDuration objects.
 *
 * 5. Helpers (`valueOf`, `fallback`): Provides utilities for extracting the raw second value or creating a default zero-duration object.
 */

import { pad } from './lib'

export interface IMOSDuration {
	_mosDuration: number // in seconds
	/** @deprecated use getMosTypes().mosDuration.stringify() instead! */
	toString: never
}

export function create(anyValue: AnyValue, strict: boolean): IMOSDuration {
	let value: number
	if (typeof anyValue === 'number') {
		value = anyValue // seconds
	} else if (typeof anyValue === 'string') {
		const m = /(\d+):(\d+):(\d+)/.exec(anyValue)
		if (!m) throw new Error(`MosDuration: Invalid input format: "${anyValue}"!`)

		const hh: number = parseInt(m[1], 10)
		const mm: number = parseInt(m[2], 10)
		const ss: number = parseInt(m[3], 10)

		if (isNaN(hh) || isNaN(mm) || isNaN(ss)) throw new Error(`MosDuration: Bad input format "${anyValue}"!`)

		value = hh * 3600 + mm * 60 + ss
	} else if (typeof anyValue === 'object' && anyValue?._mosDuration !== undefined) {
		value = anyValue._mosDuration
	} else {
		throw new Error(`MosDuration: Invalid input: "${anyValue}"`)
	}
	const mosDuration: IMOSDuration = { _mosDuration: value } as IMOSDuration
	validate(mosDuration, strict)
	return mosDuration
}
export type AnyValue = string | number | IMOSDuration
export function validate(_mosDuration: IMOSDuration, _strict: boolean): void {
	// nothing
}
export function valueOf(mosDuration: IMOSDuration): number {
	if (typeof mosDuration === 'number') return mosDuration // helpful hack
	return mosDuration._mosDuration
}
export function stringify(mosDuration: IMOSDuration): string {
	if (typeof mosDuration === 'string') return mosDuration // helpful hack
	let s = mosDuration._mosDuration

	const hh = Math.floor(s / 3600)
	s -= hh * 3600

	const mm = Math.floor(s / 60)
	s -= mm * 60

	const ss = Math.floor(s)

	return hh + ':' + pad(mm, 2) + ':' + pad(ss, 2)
}
export function is(mosDuration: IMOSDuration | any): mosDuration is IMOSDuration {
	if (typeof mosDuration !== 'object') return false
	if (mosDuration === null) return false
	return (mosDuration as IMOSDuration)._mosDuration !== undefined
}
export function fallback(): IMOSDuration {
	const mosDuration: IMOSDuration = { _mosDuration: 0 } as IMOSDuration
	validate(mosDuration, true)
	return mosDuration
}
