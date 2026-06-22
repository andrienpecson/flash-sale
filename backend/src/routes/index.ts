import { Router } from 'express';
import { saleRouter } from './sale.routes';
import { purchaseRouter } from './purchase.routes';

export const router = Router();

router.use('/sale', saleRouter);
router.use('/purchase', purchaseRouter);