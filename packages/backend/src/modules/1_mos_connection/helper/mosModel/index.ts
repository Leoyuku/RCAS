export * from './MosMessage'
export * from './lib'
export { AnyXMLObject, AnyXMLValue, AnyXMLValueSingular } from '../../internals'
export * from './profile0'
export * from './profile1'
export * from './profile2'
export { XMLObjectPaths } from './profile2/xmlConversion'
export * from './profile3'
export * from './profile4'
export * from './parseMosTypes'
export { literal, omitUndefined, flattenXMLText } from './lib'
export * from '../utils/ensureMethods'
export * from './ParseError'

import { AnyXMLObject } from '../../internals'
/** @deprecated use AnyXMLObject instead  */
export type AnyXML = AnyXMLObject // for backwards compatibility

// 解决 MosDevice 寻找 XMLMosAck 的报错，将其指向真实的 XMLMosROAck
import { XMLMosROAck } from './profile2/xmlConversion'
// 1. 导入整个命名空间
import * as XMLMosROAckNamespace from './profile2/xmlConversion'

// 2. 导出变量引用（解决运行时调用）
export const XMLMosAck = XMLMosROAckNamespace.XMLMosROAck

// 3. 导出类型引用（解决类型声明）
// 使用 typeof 获取命名空间的类型，或者如果它内部有同名类，直接指向它
export type XMLMosAck = typeof XMLMosROAckNamespace.XMLMosROAck