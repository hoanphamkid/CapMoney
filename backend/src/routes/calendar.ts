import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { calendarDay, calendarEvents, createReminder, deleteReminder, updateReminder } from '../controllers/calendarController.js';

export const calendarRouter = Router(); calendarRouter.use(requireAuth);
calendarRouter.get('/events', calendarEvents); calendarRouter.get('/day/:date', calendarDay); calendarRouter.post('/reminders', createReminder); calendarRouter.put('/reminders/:id', updateReminder); calendarRouter.delete('/reminders/:id', deleteReminder);
