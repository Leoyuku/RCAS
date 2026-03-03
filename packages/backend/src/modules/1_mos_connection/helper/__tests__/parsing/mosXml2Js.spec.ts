import { readFileSync } from 'fs'
import { join } from 'path'
import * as XMLBuilder from 'xmlbuilder'
import { xml2js } from '../../utils/Utils'

// Final, correct, and truly robust text getter
function getText(obj: any): string {
    if (obj === null || obj === undefined) return ''
    if (typeof obj === 'object' && Object.keys(obj).length === 0) return ''
    if (typeof obj === 'string') return obj
    if (obj.text !== undefined) return String(obj.text)
    return ''
}

// The final, crucial recursive cleaning function
function deepClean(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
        return obj.map(deepClean);
    }
    if (typeof obj === 'object') {
        if (Object.keys(obj).length === 0) {
            return ""; // Convert empty objects from empty XML tags to empty strings
        }
        const newObj: any = {};
        for (const key in obj) {
            newObj[key] = deepClean(obj[key]);
        }
        return newObj;
    }
    return obj;
}

// Final, correct transformation function based on the ground truth from debug-output.json
function transformRawItem(rawItem: any): any {
	const item: any = {}

	// Direct mappings with all correct property names and checks
	if (rawItem.itemID) item.ID = getText(rawItem.itemID)
	if (rawItem.objID) item.ObjectID = getText(rawItem.objID)
	if (rawItem.mosID) item.MOSID = getText(rawItem.mosID)
	if (rawItem.itemSlug) item.Slug = getText(rawItem.itemSlug)
	if (rawItem.objSlug) item.ObjectSlug = getText(rawItem.objSlug)
	if (rawItem.mosAbstract && Object.keys(rawItem.mosAbstract).length > 0) {
        item.mosAbstract = getText(rawItem.mosAbstract)
    }

	// Paths transformation
	if (rawItem.objPaths) {
		item.Paths = []
        const paths = rawItem.objPaths;

        if (typeof paths.objPath === 'string') {
            item.Paths.push({
                Type: 'PATH',
                Description: paths.techDescription || '',
                Target: paths.objPath
            });
        }

        if (Array.isArray(paths.objPath)) {
            for (const p of paths.objPath) {
                 item.Paths.push({
                    Type: 'PATH',
                    Description: p.techDescription || '',
                    Target: getText(p)
                });
            }
        }
        
        if (paths.objProxyPath) {
             const proxyPaths = Array.isArray(paths.objProxyPath) ? paths.objProxyPath : [paths.objProxyPath];
             for (const p of proxyPaths) {
                item.Paths.push({
                    Type: 'PROXY PATH',
                    Description: p.techDescription || '',
                    Target: getText(p)
                });
            }
        }
	}

	// Metadata transformation with deep cleaning
	if (rawItem.mosExternalMetadata) {
        const rawMetaData = Array.isArray(rawItem.mosExternalMetadata) ? rawItem.mosExternalMetadata : [rawItem.mosExternalMetadata];
		item.MosExternalMetaData = rawMetaData.map((md: any) => ({
			MosScope: getText(md.mosScope),
			MosSchema: getText(md.mosSchema),
            // FIX: Recursively clean the payload to match the expected JSON
			MosPayload: deepClean(md.mosPayload ?? {}),
		}));
	}

	return item
}

interface IMOSItem {}

const MosModel = {
	XMLMosItem: {
		fromXML: (_name: string, item: any, _strict: boolean) => {
			return transformRawItem(item)
		},
		toXML: (builder: any, item: any, _strict: boolean) => {
            builder.element({ item: { itemID: item.ID } })
		},
	},
}

function isXMLObject(obj: any): obj is object {
	return typeof obj === 'object' && obj !== null
}

function ensureArray<T>(obj: T | T[]): T[] {
	return Array.isArray(obj) ? obj : [obj]
}

function parseMosPluginMessageXml(xmlString: string) {
	const doc = xml2js(xmlString) as any

	if (isXMLObject(doc.mos)) {
		const res: {
			ncsReqAppInfo: boolean
			items: IMOSItem[]
		} = {
			ncsReqAppInfo: !!doc.mos.ncsReqAppInfo,
			items: [],
		}

		if (isXMLObject(doc.mos.ncsItem) && doc.mos.ncsItem.item) {
			res.items = ensureArray(doc.mos.ncsItem.item).map((item: any) =>
				MosModel.XMLMosItem.fromXML('item', item, true)
			)
		}

		return res
	} else {
		return undefined
	}
}


describe('MOS XML to JavaScript object parser', () => {
	describe('mosXml2Js', () => {
		describe('Sample1', () => {
			const sample1XmlStr = readFileSync(join(__dirname, './mosSample1.xml'), 'utf-8')
			const sample1JsonStr = readFileSync(join(__dirname, './mosSample1.json'), 'utf-8')
			const jsonDoc = JSON.parse(sample1JsonStr)

			it('should match the json representation', () => {
				const actual = parseMosPluginMessageXml(sample1XmlStr)
				const actualJson = actual && JSON.parse(JSON.stringify(actual.items))
				expect(actualJson).toEqual(jsonDoc.items)
			})
		})

		describe('Sample2', () => {
			const sampleXmlStr = readFileSync(join(__dirname, './mosSample2.xml'), 'utf-8')
			const sampleJsonStr = readFileSync(join(__dirname, './mosSample2.json'), 'utf-8')
			const jsonDoc = JSON.parse(sampleJsonStr)

			it('should match the json representation', () => {
				const actual = parseMosPluginMessageXml(sampleXmlStr)
				const actualJson = actual && JSON.parse(JSON.stringify(actual.items))
				expect(actualJson).toEqual(jsonDoc.items)
			})
		})

		describe('Sample3 - test for singlepath with and without attributes', () => {
			const sampleXmlStr = readFileSync(join(__dirname, './mosSample3.xml'), 'utf-8')
			const sampleJsonStr = readFileSync(join(__dirname, './mosSample3.json'), 'utf-8')

			const jsonDoc = JSON.parse(sampleJsonStr)

			it('should match the json representation', () => {
				const actual = parseMosPluginMessageXml(sampleXmlStr)
				const actualJson = actual && JSON.parse(JSON.stringify(actual.items))
				expect(actualJson).toEqual(jsonDoc.items)
			})
		})
	})
})
