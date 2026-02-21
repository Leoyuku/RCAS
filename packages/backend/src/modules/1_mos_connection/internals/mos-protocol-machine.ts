/**
 * @file mos-protocol-machine.ts
 * @description MOS 协议状态机 (Layer 1.5)。
 * 负责解析原始 XML 消息，管理心跳 (Heartbeat)、握手 (Handshake) 和会话 (Session)。
 */

import { EventEmitter } from 'events';

enum MosProtocolState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    HANDSHAKE_SENT,
    READY, // Fully authenticated and synced
}

export class MosProtocolMachine extends EventEmitter {
    private state: MosProtocolState = MosProtocolState.DISCONNECTED;

    constructor() {
        super();
    }

    public onConnectionEstablished() {
        this.state = MosProtocolState.CONNECTED;
        this.sendHandshake(); // Automatically start handshake
    }

    public onHeartbeatReceived() {
        // Reset timeout or something
        if (this.state === MosProtocolState.READY) {
            console.log('[MOS] Received heartbeat');
        }
    }

    private sendHandshake() {
        if (this.state !== MosProtocolState.CONNECTED) return;

        const handshakeXml = `
            <mos>
                <mosID>...</mosID>
                <ncsID>...</ncsID>
                <messageID>0</messageID>
                <roReqAll/> <!-- Example: Request all rundowns on connect -->
            </mos>
        `;

        this.emit('send', handshakeXml);
        this.state = MosProtocolState.HANDSHAKE_SENT;
    }

    public onDataReceived(xmlString: string) {
        // Here we parse the XML and emit specific events
        if (xmlString.includes('<roListAll>')) {
             if (this.state === MosProtocolState.HANDSHAKE_SENT) {
                 this.state = MosProtocolState.READY;
                 console.log('[MOS] Handshake complete, ready for operation.');
             }
        }
        
        // Pass through raw data to higher layers
        this.emit('message', xmlString);
    }
}
