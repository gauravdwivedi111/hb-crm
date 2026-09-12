import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { enquiryRouter } from './enquiry.routes.js';
import { followupRouter } from './followup.routes.js';
import { notificationRouter } from './notification.routes.js';
import { customerRouter } from './customer.routes.js';
import { quotationRouter } from './quotation.routes.js';
import { attachmentRouter } from './attachment.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { reportRouter } from './report.routes.js';
import { searchRouter } from './search.routes.js';
import { userRouter } from './user.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/enquiries', enquiryRouter);
apiRouter.use('/followups', followupRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/quotations', quotationRouter);
apiRouter.use('/attachments', attachmentRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/users', userRouter);

