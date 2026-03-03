/**
 * @fileoverview This module, a direct port from the Sofie project, defines and manages the MosString128 type,
 * a foundational data type for the MOS protocol. It ensures that any string designated as a MosString128
 * conforms to the protocol's 128-character limit.
 *
 * It employs a factory pattern (`create`) rather than a class, providing a robust and type-safe way to handle
 * this specific data format.
 *
 * Key Functions:
 *
 * 1. Core Definition (`IMOSString128` interface): Establishes a "nominal type" via the `_mosString128` property.
 *    This provides compile-time safety, distinguishing it from a standard `string`.
 *
 * 2. Factory (`create` function): The primary entry point. It intelligently converts various input types
 *    (strings, objects, undefined) into a valid IMOSString128 object.
 *
 * 3. Validation (`validate` function): Called by the factory, this function enforces the 128-character limit.
 *    It includes a `strict` mode, offering flexibility during development and integration.
 *
 * 4. Type Guard (`is` function): Provides runtime type safety. It allows other parts of the application to
 *    reliably check if a variable is a true IMOSString128, preventing data corruption.
 *
 * 5. Helpers (`valueOf`, `stringify`, `fallback`): Utility functions for easily converting the type back to a
 *    primitive string or creating a default, empty instance.
 */
export interface IMOSString128 {
	_mosString128: string
	/** @deprecated use getMosTypes().mosString128.stringify() instead! */
	toString: never
}

export function create(anyValue: AnyValue, strict: boolean): IMOSString128 {
	let strValue: string
	if (typeof anyValue === 'object' && anyValue) {
		if ('_mosString128' in anyValue && anyValue._mosString128 !== undefined) {
			strValue = anyValue._mosString128
		} else if ('text' in anyValue && anyValue.text) {
			strValue = `${anyValue.text}`
		} else if (Object.keys(anyValue).length === 0) {
			// is empty?
			strValue = ''
		} else {
			strValue = JSON.stringify(anyValue)
		}
	} else if (anyValue === undefined) {
		strValue = ''
	} else {
		strValue = anyValue !== `undefined` ? String(anyValue) : ''
	}
	const mosString: IMOSString128 = { _mosString128: strValue } as IMOSString128
	validate(mosString, strict)
	return mosString
}
export type AnyValue = string | { text: string; type: string } | IMOSString128 | undefined

export function validate(mosString128: IMOSString128, strict: boolean): void {
	if (!strict) return
	if ((mosString128._mosString128 || '').length > 128)
		throw new Error(
			'MosString128: string length is too long (' +
				mosString128._mosString128 +
				')! (To turn ignore this error, set the strict option to false)'
		)
}
export function valueOf(mosString128: IMOSString128): string {
	if (typeof mosString128 === 'string') return mosString128 // helpful hack
	return mosString128._mosString128
}
export function stringify(mosString128: IMOSString128): string {
	if (typeof mosString128 === 'string') return mosString128 // helpful hack
	return mosString128._mosString128
}
export function is(mosString128: IMOSString128 | any): mosString128 is IMOSString128 {
	if (typeof mosString128 !== 'object') return false
	if (mosString128 === null) return false
	return (mosString128 as IMOSString128)._mosString128 !== undefined
}
export function fallback(): IMOSString128 {
	const mosString: IMOSString128 = { _mosString128: '' } as IMOSString128
	validate(mosString, true)
	return mosString
}
