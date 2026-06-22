import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { handlePurchase } from '../controllers/purchase.controller';

export const purchaseRouter = Router();

purchaseRouter.post('/', asyncHandler(handlePurchase));