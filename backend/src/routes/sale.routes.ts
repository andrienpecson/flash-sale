import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getStatus } from '../controllers/sale.controller';

export const saleRouter = Router();

saleRouter.get('/status', asyncHandler(getStatus));