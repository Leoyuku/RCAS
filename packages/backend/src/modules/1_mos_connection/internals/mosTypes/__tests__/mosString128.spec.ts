/* 核心测试逻辑:
基本功能: 确认 create, stringify, 和 valueOf 方法对于一个有效的字符串能按预期工作。
类型守卫 is(): 验证 is() 方法能准确地区分 mosString128 和其他类型（包括其他 MOS 类型和原生 JavaScript 类型）。
严格模式: 这是最关键的测试之一。它验证了在非严格模式 (getMosTypes(false)) 下，创建一个超长字符串不会抛出异常；而在严格模式 (getMosTypes(true)) 下，同样的操作会抛出异常。这直接测试了我们之前在 mosTypes.ts 中移植的工厂模式和逻辑。
输入容错性: 测试了 create 方法在面对各种非标准输入（null, {}, true）时的行为，确保其健壮性。 */


import { getMosTypes } from '../../mosTypes'

describe('MosString128', () => {
	test('basic', () => {
		const mosTypes = getMosTypes(true)

		const mosString = mosTypes.mosString128.create('test test')
		expect(mosTypes.mosString128.stringify(mosString)).toBe('test test')
		expect(mosTypes.mosString128.valueOf(mosString)).toBe('test test')
		expect(() => mosTypes.mosString128.validate(mosString)).not.toThrow()

		// @ts-expect-error wrong input, but still:
		expect(mosTypes.mosString128.valueOf('test test')).toBe('test test')
		// @ts-expect-error wrong input, but still:
		expect(mosTypes.mosString128.stringify('test test')).toBe('test test')
	})
	test('is', () => {
		const mosTypes = getMosTypes(true)

		const mosString = mosTypes.mosString128.create('test test')
		expect(mosTypes.mosString128.is(mosString)).toBe(true)
		expect(mosTypes.mosDuration.is(mosString)).toBe(false)
		expect(mosTypes.mosTime.is(mosString)).toBe(false)

		expect(mosTypes.mosString128.is({})).toBe(false)
		expect(mosTypes.mosString128.is(null)).toBe(false)
		expect(mosTypes.mosString128.is('abc')).toBe(false)
		expect(mosTypes.mosString128.is(123)).toBe(false)
	})
	test('should throw when a too long string is created', () => {
		const strict = getMosTypes(true)
		const notStrict = getMosTypes(false)

		let tooLongStr = ''
		for (let i = 0; i < 130; i++) {
			tooLongStr += '' + i
		}
		expect(() => {
			notStrict.mosString128.create(tooLongStr)
		}).not.toThrow()
		expect(() => {
			strict.mosString128.create(tooLongStr)
		}).toThrow(/too long/)
	})
	test('Various values', () => {
		const mosTypes = getMosTypes(true)
		function toStr(input: any) {
			return mosTypes.mosString128.stringify(mosTypes.mosString128.create(input))
		}

		expect(toStr('test test')).toEqual('test test')
		expect(toStr('')).toEqual('')
		expect(toStr({})).toEqual('')
		expect(toStr(12)).toEqual('12')
		expect(toStr(true)).toEqual('true')
		expect(toStr(null)).toEqual('null')
		expect(toStr({ text: 'hello' })).toEqual('hello')
		expect(toStr({ a: 'b' })).toEqual('{"a":"b"}')

		expect(toStr(mosTypes.mosString128.create('test test'))).toEqual('test test')

		expect(
			mosTypes.mosString128.stringify(
				JSON.parse(JSON.stringify({ a: mosTypes.mosString128.create('test test') })).a
			)
		).toEqual('test test')

		// special case: "undefined" is parsed as an empty string
		expect(toStr('undefined')).toEqual('')
	})
})
