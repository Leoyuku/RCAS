export * from './MosConnection'
export * from './api'
export * from '../helper'

export { ConnectionConfig } from './config/connectionConfig'

export { MosDevice } from './MosDevice'

// Backwards compatibility
import { xml2js, pad, addTextElement, xmlToObject } from '../helper'
export const Utils = {
	pad,
	xml2js,
	addTextElement,
	xmlToObject,
}
