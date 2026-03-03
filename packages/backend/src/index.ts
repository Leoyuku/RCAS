import express from 'express';
import { MosConnector } from './modules/1_mos_connection/mos-connection';

// Self-executing async function to handle top-level await for initialization
(async () => {
    try {
        console.log('Application starting...');

        // 1. Initialize MOS Connector
        // This will start the MOS socket servers and prepare the connection.
        const mosConnector = new MosConnector();
        await mosConnector.init();

        // 2. Initialize Express Server
        const app = express();
        const port = process.env.PORT || 3000;

        // A simple root endpoint to confirm the server is running
        app.get('/', (req, res) => {
            res.send('RCAS Backend is running and MOS connection is active!');
        });

        // 3. Start the Express server
        app.listen(port, () => {
            console.log(`RCAS Backend server listening on http://localhost:${port}`);
        });

    } catch (error) {
        console.error('Failed to initialize application:', error);
        process.exit(1);
    }
})();
