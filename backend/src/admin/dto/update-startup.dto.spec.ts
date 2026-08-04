import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateStartupDto } from './update-startup.dto';
import { Sector } from '../../entities/enums/sector.enum';
import { BusinessModel } from '../../entities/enums/business-model.enum';

describe('UpdateStartupDto', () => {
  // validateSync's whitelist option strips any property without a class-validator
  // decorator. Passing { whitelist: true } here reproduces what the global
  // ValidationPipe does on every request, so if sector/businessModel lost their
  // decorators, validateSync would delete them from dto and this test would fail.
  it('keeps sector and businessModel after whitelisting', () => {
    const dto = plainToInstance(
      UpdateStartupDto,
      { sector: 'healthtech', businessModel: 'b2b' },
      { excludeExtraneousValues: false },
    );

    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.sector).toBe(Sector.Healthtech);
    expect(dto.businessModel).toBe(BusinessModel.B2B);
  });

  it('rejects a sector outside the taxonomy', () => {
    const dto = plainToInstance(UpdateStartupDto, { sector: 'agritechh' });
    const errors = validateSync(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('sector');
  });

  it('allows both fields to be omitted', () => {
    const dto = plainToInstance(UpdateStartupDto, { name: 'AgroLink PH' });

    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.sector).toBeUndefined();
  });
});
