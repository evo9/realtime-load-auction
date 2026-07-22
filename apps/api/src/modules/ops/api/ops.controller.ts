import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@src/modules/identity/api/guards/jwt-auth.guard';
import { RolesGuard } from '@src/modules/identity/api/guards/roles.guard';
import { Roles } from '@src/modules/identity/api/decorators/roles.decorator';
import { ListSagasHandler } from '@src/modules/ops/application/list-sagas.handler';
import { ListDlqHandler } from '@src/modules/ops/application/list-dlq.handler';
import { ListSagasQueryDto } from '@src/modules/ops/api/dto/list-sagas-query.dto';
import { ListDlqQueryDto } from '@src/modules/ops/api/dto/list-dlq-query.dto';
import {
  SagaOpsDto,
  toSagaOpsDto,
} from '@src/modules/ops/api/dto/saga-ops.dto';
import {
  DlqQueueSummaryDto,
  toDlqQueueSummaryDto,
} from '@src/modules/ops/api/dto/dlq-ops.dto';

@Controller('ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class OpsController {
  constructor(
    private readonly listSagas: ListSagasHandler,
    private readonly listDlq: ListDlqHandler,
  ) {}

  @Get('sagas')
  async sagas(@Query() query: ListSagasQueryDto): Promise<SagaOpsDto[]> {
    const rows = await this.listSagas.execute(query);
    return rows.map(toSagaOpsDto);
  }

  @Get('dlq')
  async dlq(@Query() query: ListDlqQueryDto): Promise<DlqQueueSummaryDto[]> {
    const rows = await this.listDlq.execute(query.limit);
    return rows.map(toDlqQueueSummaryDto);
  }
}
