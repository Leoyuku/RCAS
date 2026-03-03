import { smartMergeItem } from '../../profile1/xmlConversion'
import * as XMLBuilder from 'xmlbuilder'
import { xmlToObject } from '../../../utils/Utils'
import { XMLMosItem } from '../'
import { getMosTypes, IMOSScope } from '../../../../internals/mosTypes'
import { IMOSItem, IMOSObjectPathType } from '../../../../internals/model'

describe('XMLMosItem', () => {
    test('Should handle conversion losslessly', () => {
        const mosTypes = getMosTypes(true)

        // 1. 重新定义 refItem (之前报错找不到的地方)
        const refItem: IMOSItem = {
            ID: mosTypes.mosString128.create('ID'),
            Slug: mosTypes.mosString128.create('Slug'),
            ObjectSlug: mosTypes.mosString128.create('ObjectSlug'),
            ObjectID: mosTypes.mosString128.create('ObjectID'),
            MOSID: 'MOSID',
            mosAbstract: 'mosAbstract',
            Paths: [
                {
                    Type: IMOSObjectPathType.PATH,
                    Description: 'asdfasdf',
                    Target: 'asdfasdf',
                },
                {
                    Type: IMOSObjectPathType.METADATA_PATH,
                    Description: 'skdjhfb',
                    Target: '8372h4fv',
                },
            ],
            Channel: mosTypes.mosString128.create('Channel'),
            EditorialStart: 1,
            EditorialDuration: 2,
            Duration: 3,
            TimeBase: 4,
            UserTimingDuration: 5,
            Trigger: 'Trigger',
            MacroIn: mosTypes.mosString128.create('MacroIn'),
            MacroOut: mosTypes.mosString128.create('MacroOut'),
            MosExternalMetaData: [
                {
                    MosScope: IMOSScope.PLAYLIST,
                    MosSchema: 'asdf123',
                    MosPayload: {
                        frameRate: { 
                            text: '60fps', 
                            techDescription: 'High Frame Rate' 
                        },
                        Owner: 'SHOLMES'
                    },
                },
                {
                    MosScope: IMOSScope.OBJECT,
                    MosSchema: 'asdf1234',
                    MosPayload: {
                        hello: {
                            brave: 'new world',
                        },
                    },
                },
            ],
        }

        // 2. 更新后的 refXml (确保内容一致)
        const refXml = `<myItem><item><itemID>ID</itemID><objID>ObjectID</objID><mosID>MOSID</mosID><itemSlug>Slug</itemSlug><objPaths><objPath techDescription="asdfasdf">asdfasdf</objPath><objMetadataPath techDescription="skdjhfb">8372h4fv</objMetadataPath></objPaths><itemEdStart>1</itemEdStart><itemEdDur>2</itemEdDur><itemUserTimingDur>5</itemUserTimingDur><itemTrigger>Trigger</itemTrigger><mosExternalMetadata><mosScope>PLAYLIST</mosScope><mosSchema>asdf123</mosSchema><mosPayload><frameRate><text>60fps</text><techDescription>High Frame Rate</techDescription></frameRate><Owner>SHOLMES</Owner></mosPayload></mosExternalMetadata><mosExternalMetadata><mosScope>OBJECT</mosScope><mosSchema>asdf1234</mosSchema><mosPayload><hello><brave>new world</brave></hello></mosPayload></mosExternalMetadata><mosAbstract>mosAbstract</mosAbstract><objSlug>ObjectSlug</objSlug><itemChannel>Channel</itemChannel><objDur>3</objDur><objTB>4</objTB><macroIn>MacroIn</macroIn><macroOut>MacroOut</macroOut></item></myItem>`

        const xmlItem = XMLBuilder.create('myItem')
        
        // 这里会用到 refItem
        XMLMosItem.toXML(xmlItem, refItem, true)

        expect(fixWhiteSpace(xmlItem.toString())).toEqual(fixWhiteSpace(refXml))
        expect(xmlItem.children).toHaveLength(1)

        const itemObj = xmlToObject(xmlItem)

        // 这里也会用到 refItem 进行深度比较
        const item2 = XMLMosItem.fromXML('item', itemObj.item, true)
        expect(item2).toEqual(refItem)
    })

	test('Profile 2: Smart Merge should protect metadata attributes', () => {
		const mosTypes = getMosTypes(true)
	
		// 补齐 ObjectID 和 MOSID 以满足接口要求
		const baseItem = {
			ObjectID: mosTypes.mosString128.create('OBJ1'),
			MOSID: 'TEST.MOS'
		}
	
		// 1. 内存中的原始数据
		const itemInMemory: IMOSItem = {
			...baseItem,
			ID: mosTypes.mosString128.create('ITEM_1'),
			Slug: mosTypes.mosString128.create('Old Slug'),
			MosExternalMetaData: [{
				MosScope: IMOSScope.OBJECT,
				MosSchema: 'vrt',
				MosPayload: {
					frameRate: { text: '60fps', techDescription: 'HFR' }
				}
			}]
		} as IMOSItem
	
		// 2. 来自 NCS 的更新
		const incomingUpdate: IMOSItem = {
			...baseItem,
			ID: mosTypes.mosString128.create('ITEM_1'),
			Slug: mosTypes.mosString128.create('New Shiny Slug'),
			MosExternalMetaData: [{
				MosScope: IMOSScope.OBJECT,
				MosSchema: 'vrt',
				MosPayload: {
					frameRate: '60fps' 
				}
			}]
		} as IMOSItem

        // 3. 执行智能合并
        const result = smartMergeItem(itemInMemory, incomingUpdate)

        // 4. 验证：Slug 更新了
        // 我们直接创建一个期望的 MosString 对象，让 Jest 去做深度对比
        expect(result.Slug).toEqual(mosTypes.mosString128.create('New Shiny Slug'))

        // 验证元数据属性自愈 (这一步才是我们 Smart Merge 的灵魂)
        const payload = (result.MosExternalMetaData as any)[0].MosPayload
        
        expect(payload.frameRate.techDescription).toBe('HFR')
        expect(payload.frameRate.text).toBe('60fps')
    })
})

function fixWhiteSpace(str: string): string {
	return str.replace(/[\r\n\t]/g, '')
}
