import { 
    IMOSObjectPath, 
    IMOSObjectPathType 
} from '../../../../internals'
import { XMLMosExternalMetaData } from '../../profile1/xmlConversion'
import { XMLROStory } from '../xmlConversion'
import { XMLObjectPaths } from '../../profile1/xmlConversion'
import { xml2js } from '../../../utils/Utils'
import * as XMLBuilder from 'xmlbuilder'

describe('roStorySend', () => {
	it('should parse a roStorySend message with mosObj', () => {
		const xml = `
			<roStorySend>
				<story>
					<storyID>story1</storyID>
					<item>
						<itemID>item1</itemID>
						<objID>obj1</objID>
						<mosID>test.mos</mosID>
						<mosObj>
							<objType>VIDEO</objType>
							<objSlug>Test Slug</objSlug>
							<objTB>59.94</objTB>
							<objDur>1000</objDur>
							<objPaths>
								<objPath techDescription="gfx-path">/path/to/gfx</objPath>
							</objPaths>
						</mosObj>
					</item>
				</story>
			</roStorySend>`

		const parsedXml = xml2js(xml)
		
		const story = XMLROStory.fromXML('story', (parsedXml.roStorySend as any).story, true)

		expect(story).toBeDefined()
		expect(story.Items).toHaveLength(1)
		const item = story.Items[0]
		expect(item.MosObjects).toBeDefined()
		expect(item.MosObjects).toHaveLength(1)
		const mosObj = item.MosObjects![0]
		expect(mosObj.Type).toBe('VIDEO')
		expect(mosObj.Slug._mosString128).toBe('Test Slug')
		expect(mosObj.Paths).toHaveLength(1)
		expect(mosObj.Paths?.[0].Type).toBe('PATH')
		expect(mosObj.Paths?.[0].Description).toBe('gfx-path')
		expect(mosObj.Paths?.[0].Target).toBe('/path/to/gfx')
	})
})

describe('XMLObjectPaths Round-trip', () => {
    it('should correctly convert to XML and back (with multiple paths and attributes)', () => {
        // 1. 模拟数据 (使用顶部导入的类型)
        const mockPaths: IMOSObjectPath[] = [
            {
                Type: IMOSObjectPathType.PATH,
                Description: 'High-Res-Master',
                Target: '\\\\Server\\Media\\Clip001.mxf'
            },
            {
                Type: IMOSObjectPathType.PROXY_PATH,
                Description: 'Low-Res-Proxy',
                Target: 'http://proxy-server/clip001.mp4'
            }
        ]

        // 2. JS -> XML
        // 注意：这里直接使用顶部 import 的 XMLBuilder 和 XMLObjectPaths
        const root = XMLBuilder.create('mosObj')
        
        // 如果这里显示暗色，请确保下面这一行没有拼写错误
        XMLObjectPaths.toXML(root, mockPaths, true) 
        
        const xmlString = root.end({ pretty: true })

        // 3. XML -> JS
        const parsedData = xml2js(xmlString) as any

		// 调试一下看结构（可选）
		// console.log('DEBUG Round-trip Structure:', JSON.stringify(parsedData))

		// 关键修正：确保从正确的节点开始解析
		// 如果 xml2js 保留了根节点，则需要 parsedData.mosObj.objPaths
		// 如果 root 节点被提升了，则需要 parsedData.objPaths
		const inputForFromXML = parsedData.mosObj?.objPaths || parsedData.objPaths || parsedData

		const recoveredPaths = XMLObjectPaths.fromXML(
			'objPaths', 
			inputForFromXML, 
			true
		)

        // 4. 断言
        expect(recoveredPaths).toHaveLength(2)
        expect(recoveredPaths[0]?.Description).toBe('High-Res-Master')
        expect(recoveredPaths[0].Target).toBe('\\\\Server\\Media\\Clip001.mxf')
    })
})

describe('XMLMosExternalMetaData Enhanced Logic Verification', () => {
    it('should handle multiple arbitrary attributes and nested structures', () => {
		const xmlString = `
			<mosExternalMetadata>
				<mosScope>OBJECT</mosScope>
				<mosSchema>http://schema.com</mosSchema>
				<mosPayload>
					<Owner>SHOLMES</Owner>
					
					<frameRate color="red" weight="bold" techDescription="HFR">60fps</frameRate>
					
					<Graphic>
						<Layer id="101" visible="true">LowerThird</Layer>
					</Graphic>
				</mosPayload>
			</mosExternalMetadata>`
		
		const parsedXml = xml2js(xmlString) as any
		const metadata = XMLMosExternalMetaData.fromXML('metadata', parsedXml.mosExternalMetadata, true)
		const payload = metadata[0].MosPayload as any
	
		console.log('--- 100% Perfect Logic Result ---')
		console.log(JSON.stringify(payload, null, 2))
	
		// 断言 1：简单标签不受干扰
		expect(payload.Owner).toBe('SHOLMES')
	
		// 断言 2：所有自定义属性（color, weight, techDescription）都归位到了 frameRate
		expect(payload.frameRate.text).toBe('60fps')
		expect(payload.frameRate.color).toBe('red')
		expect(payload.frameRate.weight).toBe('bold')
		expect(payload.frameRate.techDescription).toBe('HFR')
	
		// 断言 3：深层嵌套的属性（id, visible）也正确归位
		expect(payload.Graphic.Layer.text).toBe('LowerThird')
		expect(payload.Graphic.Layer.id).toBe('101')
		expect(payload.Graphic.Layer.visible).toBe('true')
	})
})