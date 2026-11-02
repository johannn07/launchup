import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from 'src/auth/guard/admin.guard';
import { StartupController } from './startup.controller';

// SRS 3.4: admissions decisions were JwtGuard-only, so a founder could approve
// their own application through the API. The UI hiding the buttons is not a control.
describe('StartupController admissions routes', () => {
  it.each([
    'approveApplicant',
    'waitlistApplicant',
    'appointMentors',
    'markStartupComplete',
    'changeMentor',
    'generateAnalysisSummary',
  ])('%s requires a Manager', (method) => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        (StartupController.prototype as any)[method],
      ) ?? [];
    expect(guards).toContain(AdminGuard);
  });
});
