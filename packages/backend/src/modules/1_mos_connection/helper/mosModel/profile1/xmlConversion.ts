import * as XMLBuilder from 'xmlbuilder'
import {
	IMOSExternalMetaData,
	AnyXMLValue,
	IMOSScope,
	IMOSObject,
	IMOSObjectPath,
	IMOSObjectPathType,
	IMOSObjectType,
	IMOSObjectStatus,
	IMOSObjectAirStatus,
	IMOSItem,
} from '../../../internals'
import { AnyXMLObject, has, isEmpty, omitUndefined, literal, flattenXMLText } from '../lib'
import { ensureArray, ensureXMLObject, ensureXMLObjectArray } from '../../utils/ensureMethods'
import { getParseMosTypes } from '../parseMosTypes'
import { ParseError } from '../ParseError'
import { addTextElementInternal } from '../../utils/Utils'

/* eslint-disable @typescript-eslint/no-namespace */
export namespace XMLMosExternalMetaData {
	export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): IMOSExternalMetaData[] {
		try {
			const mosTypes = getParseMosTypes(strict)

			const metadata: IMOSExternalMetaData[] = []
			for (const xmlMetadata of ensureXMLObjectArray(xml, strict)) {
				metadata.push({
					MosScope: mosTypes.stringEnum.createRequired(
						{ value: xmlMetadata.mosScope, enum: IMOSScope },
						'mosScope'
					),
					MosSchema: mosTypes.string.createRequired(xmlMetadata.mosSchema, 'mosSchema'),
					MosPayload: fixXMLMosPayload(xmlMetadata.mosPayload),
				})
			}
			return metadata
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}

	export function toXML(xml: XMLBuilder.XMLElement, metadatas: IMOSExternalMetaData[]): void {
		for (const metadata of metadatas) {
			const xmlMetadata = XMLBuilder.create({
				mosExternalMetadata: {
					mosScope: metadata.MosScope,
					mosSchema: metadata.MosSchema,
					mosPayload: metadata.MosPayload,
				},
			})
			xml.importDocument(xmlMetadata)
		}
	}
}

function fixXMLMosPayload(value: any): any {
    if (typeof value !== 'object' || value === null) return value
    if (Array.isArray(value)) return value.map(fixXMLMosPayload)
    if (isEmpty(value)) return ''

    // 定义 MOS 及其周边插件中最常见、可能被 xml2js 提拔的属性名
	const MOS_ATTRIBUTES = [
		// 基础元数据
		'techDescription', 'id', 'name', 'type', 'version', 
		// 视觉表现
		'color', 'weight', 'style', 'font', 'size', 'align', 'visible',
		// 时序与状态
		'mode', 'status', 'action', 'state', 'trigger',
		// 层级与位置
		'layer', 'channel', 'index', 'priority', 'group',
		// 厂商特定常用属性
		'template', 'plugin', 'command', 'variant', 'path'
	]

    const fixedObj: any = {}
    
    // 1. 找出当前层级中真正属于“被提升属性”的 Key
    const currentHoistedAttrs: Record<string, any> = {}
    for (const key of Object.keys(value)) {
        if (MOS_ATTRIBUTES.includes(key) && typeof value[key] !== 'object') {
            currentHoistedAttrs[key] = value[key]
        }
    }

    const hasAttrs = Object.keys(currentHoistedAttrs).length > 0

    for (const key of Object.keys(value)) {
        // 如果这个 Key 本身就是属性，跳过（因为它会被合并到子项里）
        if (MOS_ATTRIBUTES.includes(key)) continue

        let child = value[key]

        // 2. 归位逻辑：仅当子项是字符串且我们抓到了属性时
        if (typeof child === 'string' && hasAttrs) {
            fixedObj[key] = {
                text: child,
                ...currentHoistedAttrs
            }
        } 
        // 3. 处理已有的对象结构（防止 xml2js 部分解析的情况）
        else if (child && typeof child === 'object' && child.text !== undefined) {
            fixedObj[key] = {
                ...currentHoistedAttrs,
                ...child
            }
        }
        else {
            fixedObj[key] = fixXMLMosPayload(child)
        }
    }

    return fixedObj
}

export namespace XMLMosObjects {
	export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): IMOSObject {
		try {
			xml = ensureXMLObject(xml, strict)
			const mosTypes = getParseMosTypes(strict)

			const mosObj: IMOSObject = {
				ID: mosTypes.mosString128.createRequired(xml.objID, 'objID'),
				Slug: mosTypes.mosString128.createRequired(xml.objSlug, 'objSlug'),
				MosAbstract: mosTypes.string.createOptional(xml.mosAbstract, 'mosAbstract'),
				Group: mosTypes.string.createOptional(xml.objGroup, 'objGroup'),
				Type: mosTypes.stringEnum.createRequired({ value: xml.objType, enum: IMOSObjectType }, 'objType'),
				TimeBase: mosTypes.number.createRequired(xml.objTB, 'objTB'),
				Revision: mosTypes.number.createOptional(xml.objRev, 'objRev'),
				Duration: mosTypes.number.createRequired(xml.objDur, 'objDur'),
				Status: mosTypes.stringEnum.createOptional({ value: xml.status, enum: IMOSObjectStatus }, 'status'),
				AirStatus: mosTypes.stringEnum.createOptional({ value: xml.objAir, enum: IMOSObjectAirStatus }, 'objAir'),
				Paths: has(xml, 'objPaths') ? XMLObjectPaths.fromXML('objPaths', xml.objPaths, strict) : [],
				CreatedBy: mosTypes.mosString128.createOptional(xml.createdBy, 'createdBy'),
				Created: mosTypes.mosTime.createOptional(xml.created, 'created'),
				ChangedBy: mosTypes.mosString128.createOptional(xml.changedBy, 'changedBy'),
				Changed: mosTypes.mosTime.createOptional(xml.changed, 'changed'),
				Description: mosTypes.string.createOptional(xml.description, 'description'),
				MosExternalMetaData: has(xml, 'mosExternalMetadata')
					? XMLMosExternalMetaData.fromXML('mosExternalMetadata', xml.mosExternalMetadata, strict)
					: [],
			}
			omitUndefined(mosObj)
			return mosObj
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
	export function toXML(root: XMLBuilder.XMLElement, mosObject: IMOSObject, strict: boolean): void {
		const xmlObject = addTextElementInternal(root, 'mosObj', undefined, undefined, strict)

		addTextElementInternal(xmlObject, 'objID', mosObject.ID, undefined, strict)
		addTextElementInternal(xmlObject, 'objSlug', mosObject.Slug, undefined, strict)
		if (mosObject.MosAbstract) addTextElementInternal(xmlObject, 'mosAbstract', mosObject.MosAbstract, undefined, strict)
		if (mosObject.Group) addTextElementInternal(xmlObject, 'objGroup', mosObject.Group, undefined, strict)
		addTextElementInternal(xmlObject, 'objType', mosObject.Type, undefined, strict)
		addTextElementInternal(xmlObject, 'objTB', mosObject.TimeBase, undefined, strict)
		if (mosObject.Revision) addTextElementInternal(xmlObject, 'objRev', mosObject.Revision, undefined, strict)
		addTextElementInternal(xmlObject, 'objDur', mosObject.Duration, undefined, strict)
		if (mosObject.Status) addTextElementInternal(xmlObject, 'status', mosObject.Status, undefined, strict)
		if (mosObject.AirStatus) addTextElementInternal(xmlObject, 'objAir', mosObject.AirStatus, undefined, strict)
		if (mosObject.Paths) XMLObjectPaths.toXML(xmlObject, mosObject.Paths, strict)

		if (mosObject.CreatedBy) addTextElementInternal(xmlObject, 'createdBy', mosObject.CreatedBy, undefined, strict)
		if (mosObject.Created) addTextElementInternal(xmlObject, 'created', mosObject.Created, undefined, strict)
		if (mosObject.ChangedBy) addTextElementInternal(xmlObject, 'changedBy', mosObject.ChangedBy, undefined, strict)
		if (mosObject.Changed) addTextElementInternal(xmlObject, 'changed', mosObject.Changed, undefined, strict)
		if (mosObject.Description) addTextElementInternal(xmlObject, 'description', mosObject.Description, undefined, strict)

		if (mosObject.MosExternalMetaData) {
			XMLMosExternalMetaData.toXML(xmlObject, mosObject.MosExternalMetaData)
		}
	}
}

export namespace XMLObjectPaths {
    export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): IMOSObjectPath[] {
        try {
            const mosTypes = getParseMosTypes(strict)
            const paths: IMOSObjectPath[] = []
            
            // 将输入视为对象
            const xmlObj = xml as { [key: string]: any }

            // 1. 处理主路径 <objPath>
            if (xmlObj.objPath) {
                // 关键点：根据 utils.ts 的逻辑，属性可能被提升到了父层级 xmlObj
                const hoistedDescription = xmlObj.techDescription || ''
                const elements = ensureArray(xmlObj.objPath)
                
                for (const el of elements) {
                    if (!el) continue
                    
                    // 如果 el 是对象，优先从内部取值；如果是字符串，取提升后的属性
                    const description = typeof el === 'object' 
                        ? (el.techDescription || hoistedDescription) 
                        : hoistedDescription
                    
                    const target = typeof el === 'object' ? (el.text || el.toString()) : String(el)

                    paths.push({
                        Type: IMOSObjectPathType.PATH,
                        Description: mosTypes.string.createOptional(description, 'description') || '',
                        Target: mosTypes.string.createRequired(target, 'path'),
                    })
                }
            }

            // 2. 处理代理路径 <objProxyPath>
            if (xmlObj.objProxyPath) {
                const hoistedProxyDescription = xmlObj.techDescription || ''
                const elements = ensureArray(xmlObj.objProxyPath)
                
                for (const el of elements) {
                    if (!el) continue
                    
                    const description = typeof el === 'object' 
                        ? (el.techDescription || hoistedProxyDescription) 
                        : hoistedProxyDescription
                    
                    const target = typeof el === 'object' ? (el.text || el.toString()) : String(el)

                    paths.push({
                        Type: IMOSObjectPathType.PROXY_PATH,
                        Description: mosTypes.string.createOptional(description, 'description') || '',
                        Target: mosTypes.string.createRequired(target, 'path'),
                    })
                }
            }

            return paths
        } catch (e) {
            throw ParseError.handleCaughtError(path, e)
        }
    }

    export function toXML(root: XMLBuilder.XMLElement, paths: IMOSObjectPath[], strict: boolean): void {
        if (paths && paths.length > 0) {
            const xmlPaths = addTextElementInternal(root, 'objPaths', undefined, undefined, strict)
            for (const path of paths) {
                const tagName = path.Type === IMOSObjectPathType.PATH ? 'objPath' : 'objProxyPath'
                // 还原回标准 MOS 格式：<tag techDescription="...建">路径</tag>
                addTextElementInternal(xmlPaths, tagName, path.Target, { techDescription: path.Description }, strict)
            }
        }
    }
}

/**
 * 智能合并两个 MosPayload
 * 保护那些可能被 NCS 丢弃的标签属性
 */
function deepMergePayload(oldP: any, newP: any): any {
    // 如果新数据不存在，直接用旧的
    if (newP === undefined || newP === null) return oldP
    // 如果旧数据不存在，直接用新的
    if (oldP === undefined || oldP === null) return newP

    // 情况 A：新旧都是对象 -> 递归合并
    if (typeof oldP === 'object' && typeof newP === 'object' && !Array.isArray(oldP) && !Array.isArray(newP)) {
        const merged: any = { ...oldP }
        for (const key of Object.keys(newP)) {
            merged[key] = deepMergePayload(oldP[key], newP[key])
        }
        return merged
    }

    // 情况 B：重点！新数据退化成了字符串，但内容没变
    // 例如：oldP 是 { text: '60fps', color: 'red' }，newP 是 '60fps'
    if (typeof newP === 'string' && typeof oldP === 'object' && oldP.text === newP) {
        // 我们认为这只是 NCS 没发属性而已，内容还是那个内容，所以保留旧的（带属性的）
        return oldP
    }

    // 情况 C：内容真的变了，或者类型不匹配 -> 以新的为准
    return newP
}

export function smartMergeItem(oldItem: IMOSItem, newItem: IMOSItem): IMOSItem {
    // 基础合并
    const merged: IMOSItem = { ...oldItem, ...newItem }

    // 特殊处理：元数据的深度合并
    if (oldItem.MosExternalMetaData && newItem.MosExternalMetaData) {
        merged.MosExternalMetaData = newItem.MosExternalMetaData.map((newMeta: IMOSExternalMetaData) => {
            // 显式指定 m 的类型为 IMOSExternalMetaData
            const oldMeta = oldItem.MosExternalMetaData?.find(
                (m: IMOSExternalMetaData) => m.MosSchema === newMeta.MosSchema && m.MosScope === newMeta.MosScope
            )

            if (oldMeta) {
                return {
                    ...newMeta,
                    MosPayload: deepMergePayload(oldMeta.MosPayload, newMeta.MosPayload)
                }
            }
            return newMeta
        })
    }

    return merged
}

export namespace XMLMosObject {
	export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): IMOSObject {
		try {
			const mosTypes = getParseMosTypes(strict)
			xml = ensureXMLObject(xml, strict)

			const mosObj = literal<IMOSObject>({
				ID: mosTypes.mosString128.createOptional(xml.objID, 'objID'),
				Slug: mosTypes.mosString128.createRequired(xml.objSlug, 'objSlug'),
				MosAbstract: xml.mosAbstract,
				MosAbstractStr: flattenXMLText(xml.mosAbstract, strict),
				Group: mosTypes.string.createOptional(xml.objGroup, 'objGroup'),
				Type:
					mosTypes.stringEnum.createOptional({ value: xml.objType, enum: IMOSObjectType }, 'objType') ||
					IMOSObjectType.OTHER,
				TimeBase: mosTypes.number.createRequired(xml.objTB, 'objTB'),
				Revision: mosTypes.number.createOptional(xml.objRev, 'objRev'),
				Duration: mosTypes.number.createRequired(xml.objDur, 'objDur'),
				Status: mosTypes.stringEnum.createOptional({ value: xml.status, enum: IMOSObjectStatus }, 'status'),
				AirStatus: mosTypes.stringEnum.createOptional(
					{ value: xml.objAir, enum: IMOSObjectAirStatus },
					'objAir'
				),
				Paths: XMLObjectPaths.fromXML('objPaths', xml.objPaths, strict),
				CreatedBy: mosTypes.mosString128.createOptional(xml.createdBy, 'createdBy'),
				Created: mosTypes.mosTime.createOptional(xml.created, 'created'),
				ChangedBy: mosTypes.mosString128.createOptional(xml.changedBy, 'changedBy'),
				Changed: mosTypes.mosTime.createOptional(xml.changed, 'changed'),
				Description: xml.description,
				DescriptionStr: mosTypes.string.createOptional(flattenXMLText(xml.description, strict), 'description'),

				MosItemEditorProgID: mosTypes.mosString128.createOptional(
					xml.mosItemEditorProgID,
					'mosItemEditorProgID'
				),
				MosExternalMetaData: has(xml, 'mosExternalMetadata')
					? XMLMosExternalMetaData.fromXML('mosExternalMetadata', xml.mosExternalMetadata, strict)
					: undefined,
			})
			omitUndefined(mosObj)
			return mosObj
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
	export function toXML(xml: XMLBuilder.XMLElement, obj: IMOSObject, strict: boolean): void {
		if (obj.ID) addTextElementInternal(xml, 'objID', obj.ID, undefined, strict)
		addTextElementInternal(xml, 'objSlug', obj.Slug, undefined, strict)
		if (obj.MosAbstract) addTextElementInternal(xml, 'mosAbstract', obj.MosAbstract, undefined, strict)
		if (obj.Group) addTextElementInternal(xml, 'objGroup', obj.Group, undefined, strict)
		addTextElementInternal(xml, 'objType', obj.Type, undefined, strict)
		addTextElementInternal(xml, 'objTB', obj.TimeBase, undefined, strict)
		addTextElementInternal(xml, 'objRev', obj.Revision, undefined, strict)
		addTextElementInternal(xml, 'objDur', obj.Duration, undefined, strict)
		addTextElementInternal(xml, 'status', obj.Status, undefined, strict)
		addTextElementInternal(xml, 'objAir', obj.AirStatus, undefined, strict)
		if (obj.Paths) XMLObjectPaths.toXML(xml, obj.Paths, strict)
		addTextElementInternal(xml, 'createdBy', obj.CreatedBy, undefined, strict)
		addTextElementInternal(xml, 'created', obj.Created, undefined, strict)
		if (obj.ChangedBy) addTextElementInternal(xml, 'changedBy', obj.ChangedBy, undefined, strict)
		if (obj.Changed) addTextElementInternal(xml, 'changed', obj.Changed, undefined, strict)
		if (obj.Description) addTextElementInternal(xml, 'description', obj.Description, undefined, strict) // not handled (todo)
		if (obj.MosItemEditorProgID)
			addTextElementInternal(xml, 'mosItemEditorProgID', obj.MosItemEditorProgID, undefined, strict)
		if (obj.MosExternalMetaData) XMLMosExternalMetaData.toXML(xml, obj.MosExternalMetaData)
	}
}