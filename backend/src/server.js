import { createApp } from './app.js';
import { config } from './config/env.js';
createApp().listen(config.port, () => console.log(`KARWAHE backend on :${config.port}`));
