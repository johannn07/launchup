import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto, AuthSignInDto } from './dto';
import { MailService } from 'src/mail/mail.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private mail: MailService,
  ) {}

  // Sent here rather than in signup(), which Managers also use to create accounts.
  @Post('/signup')
  async signup(@Body() dto: AuthDto) {
    const token = await this.authService.signup(dto);
    // Not awaited: SMTP can take seconds and the account already exists.
    void this.mail.sendRegistrationConfirmation(dto.email, dto.firstName);
    return token;
  }
  @Post('/signin')
  signin(@Body() dto: AuthSignInDto) {
    return this.authService.signin(dto);
  }
}
