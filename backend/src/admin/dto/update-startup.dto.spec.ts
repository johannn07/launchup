import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateStartupDto } from './update-startup.dto';
import { Sector } from '../../entities/enums/sector.enum';
import { BusinessModel } from '../../entities/enums/business-model.enum';

describe('UpdateStartupDto', () => {
  // whitelist: true strips unknown properties, so a field missing from the DTO
  // is discarded with no error. These assertions are the only thing standing
  // between that and a PATCH that silently ignores sector.
  it('keeps sector and businessModel after whitelisting', () => {
    const dto = plainToInstance(
      UpdateStartupDto,
      { sector: 'healthtech', businessModel: 'b2b' },
      { excludeExtraneousValues: false },
    );

    expect(dto.sector).toBe(Sector.Healthtech);
    expect(dto.businessModel).toBe(BusinessModel.B2B);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a sector outside the taxonomy', () => {
    const dto = plainToInstance(UpdateStartupDto, { sector: 'agritechh' });
    const errors = validateSync(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('sector');
  });

  it('allows both fields to be omitted', () => {
    const dto = plainToInstance(UpdateStartupDto, { name: 'AgroLink PH' });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.sector).toBeUndefined();
  });
});
