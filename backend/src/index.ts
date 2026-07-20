import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { logger } from './utils/logger';
import { validateEnv } from './config/env';

validateEnv();

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  logger.info(`PriorAgent backend running on port ${PORT}`);
});