import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { EmailAlertsService } from './email-alerts.service';

@Controller({path: 'admin/email-alerts', version: '1'})
@UseGuards(AdminGuard)
export class EmailAlertsController {
  constructor(private readonly alerts: EmailAlertsService) {}
  @Get() status() { return this.alerts.status(); }
}
