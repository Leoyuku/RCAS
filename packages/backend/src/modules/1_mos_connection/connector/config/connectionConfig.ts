import { IProfiles } from '../../internals'
import { IConnectionConfig, IMOSDeviceConnectionOptions } from '../api'

/** */

export class ConnectionConfig implements IConnectionConfig {
	mosID: string
	acceptsConnections: boolean
	accepsConnectionsFrom: string[]
	debug: boolean
	openRelay:
		| boolean
		| undefined
		| {
			// options for on-the-fly-created connections
			options: IMOSDeviceConnectionOptions['primary']
		}
	offspecFailover: boolean
	strict?: boolean
	ports?: {
		lower: number
		upper: number
		query: number
	}

	private _profiles: IProfiles = {
		'0': false,
		'1': false,
		'2': false,
		'3': false,
		'4': false,
		'5': false,
		'6': false,
		'7': false,
	}

	constructor(init: IConnectionConfig) {
		/* tslint:disable */
		if (!init) throw new Error('Config object missing')
		if (typeof init !== 'object') throw new Error('Config object is not an object')
		if (init.mosID === undefined) throw new Error('Config argument "mosID" missing')
		if (init.acceptsConnections === undefined) throw new Error('Config argument "acceptsConnections" missing')
		if (init.profiles === undefined) throw new Error('Config argument "profiles" missing')
		/* tslint:enable */

		this.mosID = init.mosID
		this.acceptsConnections = init.acceptsConnections
		this.accepsConnectionsFrom = init.accepsConnectionsFrom || []
		this.debug = init.debug || false
		this.openRelay = init.openRelay || undefined
		this.offspecFailover = init.offspecFailover || false
		this.profiles = init.profiles
		this.strict = init.strict
		this.ports = init.ports
	}

	/** */
	get profiles(): IProfiles {
		return this._profiles
	}

	/** */
	set profiles(profileSupport: IProfiles) {
		let atLeastOneOtherProfile = false;
	
		// 1. 强制设置 Profile 0 (MOS 协议基石)
		this._profiles['0'] = true;
	
		// 2. 直接根据传入的配置进行赋值，不再检查交叉依赖
		const profileKeys: (keyof IProfiles)[] = ['1', '2', '3', '4', '5', '6', '7'];
		
		profileKeys.forEach(key => {
			if (profileSupport[key] === true) {
				this._profiles[key] = true;
				atLeastOneOtherProfile = true;
			}
		});
	
		// 3. 仅保留一个警告提示，不中断程序
		if (!atLeastOneOtherProfile) {
			console.warn('MOS Warning: No profiles other than 0 are enabled in configuration.');
		}
	}

	// machineInfo: {
	// 	manufacturer: "SuperFly.tv",
	//     model: 	"YAAS"
	//     //hwRev:	 ,
	//     swRev: 	'0.0.1.0'
	//     DOM: 	'', // date of manufacture
	//     /*<SN>927748927</SN>
	//     <ID>airchache.newscenter.com</ID>
	//     <time>2009-04-11T17:20:42</time>
	//     <opTime>2009-03-01T23:55:10</opTime>
	//     <mosRev>2.8.2</mosRev>
	//     */
	// }
}
