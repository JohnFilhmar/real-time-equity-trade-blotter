import express, { type Express } from 'express';
import helmet from 'helmet';

export function create_app(): Express {
  const app = express();

  app.use(helmet());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Add more routes here as needed
  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
