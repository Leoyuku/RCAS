import * as XMLBuilder from 'xmlbuilder'
import {
	IMOSROStory,
	IMOSItem,
	IMOSROFullStory,
	IMOSRunningOrderBase,
	IMOSRunningOrder,
	IMOSROAckStory,
	IMOSROAckItem,
	IMOSROAckObject,
	AnyXMLValue,
	IMOSObjectPath,
	IMOSObjectPathType,
} from '../../../internals'
import { has, omitUndefined } from '../lib'
import { ensureArray, ensureXMLObject } from '../../utils/ensureMethods'
import { ROAck } from './ROAck'
import { XMLMosExternalMetaData, XMLMosObjects } from '../profile1/xmlConversion'
import { addTextElementInternal } from '../../utils/Utils'
import { getParseMosTypes } from '../parseMosTypes'
import { ParseError } from '../ParseError'
/* eslint-disable @typescript-eslint/no-namespace */

export namespace XMLMosROAck {
	export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): ROAck {
		try {
			xml = ensureXMLObject(xml, strict)
			const mosTypes = getParseMosTypes(strict)

			const roAck: ROAck = new ROAck(
				{
					ID: mosTypes.mosString128.createRequired(xml.roID, 'roID'),
					Status: mosTypes.mosString128.createRequired(xml.roStatus, 'roStatus'),
					Stories: [],
				},
				strict
			)

			const xmlStoryIDs = ensureArray(xml.storyID)
			const xmlItemIDs = ensureArray(xml.itemID)
			const xmlObjIDs = ensureArray(xml.objID)
			const xmlStatuses = ensureArray(xml.status)

			roAck.Stories = []

			const iMax = Math.max(xmlStoryIDs.length, xmlItemIDs.length, xmlObjIDs.length, xmlStatuses.length)

			let story: IMOSROAckStory | null = null
			let item: IMOSROAckItem | null = null

			for (let i = 0; i < iMax; i++) {
				if (xmlStoryIDs[i]) {
					story = {
						ID: mosTypes.mosString128.createRequired(xmlStoryIDs[i], `storyID.${i}`),
						Items: [],
					}
					roAck.Stories.push(story)
				}
				if (xmlItemIDs[i]) {
					item = {
						ID: mosTypes.mosString128.createRequired(xmlItemIDs[i], `itemID.${i}`),
						Channel: mosTypes.mosString128.createRequired('', 'Channel'),
						Objects: [],
					}
					if (story) story.Items.push(item)
				}
				if (xmlObjIDs[i] && xmlStatuses[i]) {
					const roAckObj: IMOSROAckObject = {
						Status: mosTypes.string.createRequired(xmlStatuses[i], `status.${i}`),
						ID: mosTypes.mosString128.createRequired(xmlObjIDs[i], `objID.${i}`),
					}
					if (item) item.Objects.push(roAckObj)
				}
			}
			omitUndefined(roAck)
			return roAck
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
}
export namespace XMLRunningOrderBase {
	export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): IMOSRunningOrderBase {
		try {
			xml = ensureXMLObject(xml, strict)
			const mosTypes = getParseMosTypes(strict)

			const ro: IMOSRunningOrderBase = {
				ID: mosTypes.mosString128.createRequired(xml.roID, 'roID'),
				Slug: mosTypes.mosString128.createRequired(xml.roSlug, 'roSlug'),
				EditorialStart: mosTypes.mosTime.createOptional(xml.roEdStart, 'roEdStart'),
				EditorialDuration: mosTypes.mosDuration.createOptional(xml.roEdDur, 'roEdDur'),
				DefaultChannel: mosTypes.mosString128.createOptional(xml.roChannel, 'roChannel'),
				Trigger: mosTypes.mosString128.createOptional(xml.roTrigger, 'roTrigger'),
				MacroIn: mosTypes.mosString128.createOptional(xml.macroIn, 'macroIn'),
				MacroOut: mosTypes.mosString128.createOptional(xml.macroOut, 'macroOut'),
				MosExternalMetaData: has(xml, 'mosExternalMetadata')
					? XMLMosExternalMetaData.fromXML('mosExternalMetadata', xml.mosExternalMetadata, strict)
					: undefined,
			}
			omitUndefined(ro)
			return ro
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
	export function toXML(xmlRo: XMLBuilder.XMLElement, ro: IMOSRunningOrderBase, strict: boolean): void {
		addTextElementInternal(xmlRo, 'roID', ro.ID, undefined, strict)
		addTextElementInternal(xmlRo, 'roSlug', ro.Slug, undefined, strict)
		if (ro.DefaultChannel) addTextElementInternal(xmlRo, 'roChannel', ro.DefaultChannel, undefined, strict)
		if (ro.EditorialStart) addTextElementInternal(xmlRo, 'roEdStart', ro.EditorialStart, undefined, strict)
		if (ro.EditorialDuration) addTextElementInternal(xmlRo, 'roEdDur', ro.EditorialDuration, undefined, strict)
		if (ro.Trigger) addTextElementInternal(xmlRo, 'roTrigger', ro.Trigger, undefined, strict)
		if (ro.MacroIn) addTextElementInternal(xmlRo, 'macroIn', ro.MacroIn, undefined, strict)
		if (ro.MacroOut) addTextElementInternal(xmlRo, 'macroOut', ro.MacroOut, undefined, strict)
		if (ro.MosExternalMetaData) XMLMosExternalMetaData.toXML(xmlRo, ro.MosExternalMetaData)
	}
}
export namespace XMLRunningOrder {
	export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): IMOSRunningOrder {
		try {
			xml = ensureXMLObject(xml, strict)
			const stories: IMOSROStory[] = XMLROStories.fromXML('story', xml.story, strict)
			const ro: IMOSRunningOrder = {
				...XMLRunningOrderBase.fromXML('', xml, strict),
				Stories: stories,
			}
			omitUndefined(ro)
			return ro
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
}
export namespace XMLROStories {
	export function fromXML(path: string, xmlStories: AnyXMLValue, strict: boolean): IMOSROStory[] {
		try {
			return ensureArray(xmlStories).map((xmlStory, index) => {
				return XMLROStory.fromXML(`[${index}]`, ensureXMLObject(xmlStory, strict), strict)
			})
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
}
export namespace XMLROStoryBase {
	export function toXML(
		xmlStory: XMLBuilder.XMLElement,
		story: IMOSROStory | IMOSROFullStory,
		strict: boolean
	): void {
		addTextElementInternal(xmlStory, 'storyID', story.ID, undefined, strict)
		if (story.Slug) addTextElementInternal(xmlStory, 'storySlug', story.Slug, undefined, strict)
		if (story.Number) addTextElementInternal(xmlStory, 'storyNum', story.Number, undefined, strict)
		if (story.MosExternalMetaData) XMLMosExternalMetaData.toXML(xmlStory, story.MosExternalMetaData)
	}
}
export namespace XMLROStory {
	export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): IMOSROStory {
		try {
			xml = ensureXMLObject(xml, strict)
			const mosTypes = getParseMosTypes(strict)

			const story: IMOSROStory = {
				ID: mosTypes.mosString128.createRequired(xml.storyID, 'storyID'),
				Slug: mosTypes.mosString128.createOptional(xml.storySlug, 'storySlug'),
				Items: [],
				// TODO: Add & test Number, ObjectID, MOSID, mosAbstract, Paths
				// Channel, EditorialStart, EditorialDuration, UserTimingDuration, Trigger, MacroIn, MacroOut, MosExternalMetaData
				// MosExternalMetaData: handleError(MOSExternalMetaData.fromXML(xml.mosExternalMetadata], 'mosExternalMetadata').
				Number: mosTypes.mosString128.createOptional(xml.storyNum, 'storyNum'),

				MosExternalMetaData: has(xml, 'mosExternalMetadata')
					? XMLMosExternalMetaData.fromXML('mosExternalMetadata', xml.mosExternalMetadata, strict)
					: undefined,
			}
			if (has(xml, 'item')) story.Items = story.Items.concat(XMLMosItems.fromXML('item', xml.item, strict))
			if (has(xml, 'storyBody')) {
				try {
					const xmlStoryBody = ensureXMLObject(xml.storyBody, strict)
					// Note: the <storyBody> is sent in roStorySend
					if (has(xmlStoryBody, 'storyItem')) {
						story.Items = story.Items.concat(
							XMLMosItems.fromXML('storyItem', xmlStoryBody.storyItem, strict)
						)
					}
				} catch (e) {
					throw ParseError.handleCaughtError('storyBody', e)
				}
			}

			omitUndefined(story)
			return story
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
	export function toXML(xmlRoot: XMLBuilder.XMLElement, story: IMOSROStory, strict: boolean): void {
		const xmlStory = addTextElementInternal(xmlRoot, 'story', undefined, undefined, strict)
		XMLROStoryBase.toXML(xmlStory, story, strict)
		story.Items.forEach((item: IMOSItem) => {
			XMLMosItem.toXML(xmlStory, item, strict)
		})
	}
}
export namespace XMLMosItems {
	export function fromXML(path: string, xmlItems: AnyXMLValue, strict: boolean): Array<IMOSItem> {
		try {
			return ensureArray(xmlItems).map((xmlItem: any, index) => {
				return XMLMosItem.fromXML(`[${index}]`, xmlItem, strict)
			})
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
}
export namespace XMLMosItem {
	export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): IMOSItem {
		try {
			xml = ensureXMLObject(xml, strict)
			const mosTypes = getParseMosTypes(strict)

			const item: IMOSItem = {
				ID: mosTypes.mosString128.createRequired(xml.itemID, 'itemID'),
				ObjectID: mosTypes.mosString128.createRequired(xml.objID, 'objID'),
				MOSID: mosTypes.string.createRequired(xml.mosID, 'mosID'),
				Slug: mosTypes.mosString128.createOptional(xml.itemSlug, 'itemSlug'),
				Paths: xml.objPaths ? XMLObjectPaths.fromXML('objPaths', xml.objPaths, strict) : undefined,
				EditorialStart: mosTypes.number.createOptional(xml.itemEdStart, 'itemEdStart'),
				EditorialDuration: mosTypes.number.createOptional(xml.itemEdDur, 'itemEdDur'),
				UserTimingDuration: mosTypes.number.createOptional(xml.itemUserTimingDur, 'itemUserTimingDur'),
				Trigger: xml.itemTrigger,
				MosExternalMetaData: has(xml, 'mosExternalMetadata')
					? XMLMosExternalMetaData.fromXML('mosExternalMetadata', xml.mosExternalMetadata, strict)
					: undefined,
				mosAbstract: mosTypes.string.createOptional(xml.mosAbstract, 'mosAbstract'),
				ObjectSlug: mosTypes.mosString128.createOptional(xml.objSlug, 'objSlug'),
				Channel: mosTypes.mosString128.createOptional(xml.itemChannel, 'itemChannel'),
				Duration: mosTypes.number.createOptional(xml.objDur, 'objDur'),
				TimeBase: mosTypes.number.createOptional(xml.objTB, 'objTB'),
				MacroIn: mosTypes.mosString128.createOptional(xml.macroIn, 'macroIn'),
				MacroOut: mosTypes.mosString128.createOptional(xml.macroOut, 'macroOut'),
			}

			if (has(xml, 'mosObj')) {
				// Note: the <mosObj> is sent in roStorySend
				item.MosObjects = ensureArray(xml.mosObj).map((obj) => XMLMosObjects.fromXML('mosObj', obj, strict))
			}

			// 透传 Octopus 扩展字段（octext_ 前缀）
			// 这些字段不在 MOS 标准 schema 里，但 Octopus 用它们标识元素类型
			if (has(xml, 'octext_elemType')) {
				item.octext_elemType = mosTypes.string.createOptional(xml.octext_elemType, 'octext_elemType')
			}
			if (has(xml, 'octext_elemLabel')) {
				item.octext_elemLabel = mosTypes.string.createOptional(xml.octext_elemLabel, 'octext_elemLabel')
			}

			omitUndefined(item)
			return item
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
	export function toXML(root: XMLBuilder.XMLElement, item: IMOSItem, strict: boolean): void {
		const xmlItem = addTextElementInternal(root, 'item', undefined, undefined, strict)
		addTextElementInternal(xmlItem, 'itemID', item.ID, undefined, strict)
		addTextElementInternal(xmlItem, 'objID', item.ObjectID, undefined, strict)
		addTextElementInternal(xmlItem, 'mosID', item.MOSID, undefined, strict)

		if (item.Slug) addTextElementInternal(xmlItem, 'itemSlug', item.Slug, undefined, strict)
		if (item.Paths) XMLObjectPaths.toXML(xmlItem, item.Paths, strict)
		if (item.EditorialStart !== undefined)
			addTextElementInternal(xmlItem, 'itemEdStart', item.EditorialStart, undefined, strict)
		if (item.EditorialDuration !== undefined)
			addTextElementInternal(xmlItem, 'itemEdDur', item.EditorialDuration, undefined, strict)
		if (item.UserTimingDuration !== undefined)
			addTextElementInternal(xmlItem, 'itemUserTimingDur', item.UserTimingDuration, undefined, strict)
		if (item.Trigger) addTextElementInternal(xmlItem, 'itemTrigger', item.Trigger, undefined, strict)
		if (item.MosExternalMetaData) XMLMosExternalMetaData.toXML(xmlItem, item.MosExternalMetaData)
		if (item.mosAbstract) addTextElementInternal(xmlItem, 'mosAbstract', item.mosAbstract, undefined, strict)
		if (item.ObjectSlug) addTextElementInternal(xmlItem, 'objSlug', item.ObjectSlug, undefined, strict)
		if (item.Channel) addTextElementInternal(xmlItem, 'itemChannel', item.Channel, undefined, strict)
		if (item.Duration) addTextElementInternal(xmlItem, 'objDur', item.Duration, undefined, strict)
		if (item.TimeBase) addTextElementInternal(xmlItem, 'objTB', item.TimeBase, undefined, strict)
		if (item.MacroIn) addTextElementInternal(xmlItem, 'macroIn', item.MacroIn, undefined, strict)
		if (item.MacroOut) addTextElementInternal(xmlItem, 'macroOut', item.MacroOut, undefined, strict)

		// 透传 Octopus 扩展字段（octext_ 前缀）
		if ((item as any).octext_elemType) addTextElementInternal(xmlItem, 'octext_elemType', (item as any).octext_elemType, undefined, strict)
		if ((item as any).octext_elemLabel) addTextElementInternal(xmlItem, 'octext_elemLabel', (item as any).octext_elemLabel, undefined, strict)
		
				// TODO: MosObjects
	}
}

export namespace XMLObjectPaths {
	export function fromXML(path: string, xml: AnyXMLValue, strict: boolean): IMOSObjectPath[] {
		try {
			const xmlPaths = ensureXMLObject(xml, strict)
			const mosTypes = getParseMosTypes(strict)
			const paths: IMOSObjectPath[] = []

			const process = (pathContent: any, type: IMOSObjectPathType) => {
				if (!pathContent) return
				for (const p of ensureArray(pathContent)) {
					const pObj = ensureXMLObject(p, strict)

					let description: string | undefined = undefined
					let target: string | undefined = undefined

					if (typeof pObj === 'object' && pObj !== null && !Array.isArray(pObj)) {
						const pAsObj = pObj as any // Use 'any' to avoid compiler errors on dynamic properties

						// Safely access description
						if (pAsObj.attributes && typeof pAsObj.attributes.techDescription === 'string') {
							description = pAsObj.attributes.techDescription
						}

						// Safely access target
						if (typeof pAsObj.text === 'string') {
							target = pAsObj.text
						} else if (pAsObj.text === undefined && pAsObj.attributes) {
							// Handle self-closing tag with attributes, e.g. <objPath techDescription="..."/>
							target = ''
						}
					} else if (typeof pObj === 'string') {
						// Handle simple text node
						target = pObj
					}

					paths.push({
						Type: type,
						// createRequired will handle the 'undefined' case by throwing an error, which is what we want for required fields.
						Description: mosTypes.string.createRequired(description, `${path}.techDescription`),
						Target: mosTypes.string.createRequired(target, `${path} content`),
					})
				}
			}

			process(xmlPaths.objPath, IMOSObjectPathType.PATH)

			// objProxyPath 有两种：techDescription="Proxy"(mp4) 和 techDescription="JPG"(缩略图)
			// 把 JPG 类型映射到 METADATA_PATH，以便下游通过 Type 区分
			const objProxyPaths = ensureArray(xmlPaths.objProxyPath)
			for (const p of objProxyPaths) {
				const pObj = ensureXMLObject(p, strict) as any
				const techDesc: string = pObj?.attributes?.techDescription ?? ''
				if (techDesc === 'JPG') {
					process(p, IMOSObjectPathType.METADATA_PATH)
				} else {
					process(p, IMOSObjectPathType.PROXY_PATH)
				}
			}

			process(xmlPaths.objMetadataPath, IMOSObjectPathType.METADATA_PATH)

			return paths
		} catch (e) {
			throw ParseError.handleCaughtError(path, e)
		}
	}
	export function toXML(root: XMLBuilder.XMLElement, paths: IMOSObjectPath[], strict: boolean): void {
		if (paths) {
			const xmlPaths = addTextElementInternal(root, 'objPaths', undefined, undefined, strict)
			for (const path of paths) {
				let tagName: string
				switch (path.Type) {
					case IMOSObjectPathType.PATH:
						tagName = 'objPath'
						break
					case IMOSObjectPathType.PROXY_PATH:
						tagName = 'objProxyPath'
						break
					case IMOSObjectPathType.METADATA_PATH:
						tagName = 'objMetadataPath'
						break
					default:
						if (strict) throw new Error(`Unknown path type: ${path.Type}`)
						// Fallback to a reasonable default in non-strict mode
						tagName = 'objPath'
						break
				}
				addTextElementInternal(xmlPaths, tagName, path.Target, { techDescription: path.Description }, strict)
			}
		}
	}
}
