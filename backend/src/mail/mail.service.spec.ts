import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import { AuthController } from 'src/auth/auth.controller';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const config = (vars: Record<string, string>) =>
  ({ get: (k: string) => vars[k] }) as unknown as ConfigService;

const SMTP = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_USER: 'sender@example.test',
  SMTP_PASS: 'pw',
};

// SRS 1.1: newly registered users get a confirmation email.
describe('MailService', () => {
  const sendMail = jest.fn<Promise<unknown>, [SendMailOptions]>();
  const createTransport = nodemailer.createTransport as unknown as jest.Mock<
    unknown,
    [Record<string, unknown>]
  >;
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({});
    createTransport.mockReset().mockReturnValue({ sendMail });
  });

  it('is disabled and sends nothing without SMTP settings', async () => {
    const mail = new MailService(config({}));
    expect(mail.isEnabled).toBe(false);
    await mail.sendRegistrationConfirmation('a@x.test', 'Ana');
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('sends to the new user with a link to the deployed login page', async () => {
    const mail = new MailService(
      config({
        ...SMTP,
        FRONTEND_ORIGINS:
          ' https://launchup.example.test/ , https://other.test',
      }),
    );
    await mail.sendRegistrationConfirmation('a@x.test', 'Ana');
    const msg = sendMail.mock.calls[0][0];
    expect(msg.to).toBe('a@x.test');
    expect(msg.from).toBe('LaunchUp <sender@example.test>');
    expect(msg.text).toContain('Hi Ana,');
    expect(msg.text).toContain('https://launchup.example.test/login');
  });

  it('uses implicit TLS on port 465 only', () => {
    new MailService(config({ ...SMTP, SMTP_PORT: '465' }));
    new MailService(config(SMTP));
    const calls = createTransport.mock.calls;
    expect(calls[0][0]).toMatchObject({ port: 465, secure: true });
    expect(calls[1][0]).toMatchObject({ port: 587, secure: false });
  });

  it('escapes the name in the HTML body', async () => {
    const mail = new MailService(config(SMTP));
    await mail.sendRegistrationConfirmation('a@x.test', '<b>Ana</b>');
    expect(sendMail.mock.calls[0][0].html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });

  it('swallows a send failure', async () => {
    sendMail.mockRejectedValue(new Error('535 auth failed'));
    const mail = new MailService(config(SMTP));
    await expect(
      mail.sendRegistrationConfirmation('a@x.test'),
    ).resolves.toBeUndefined();
  });
});

describe('AuthController.signup', () => {
  it('returns the token and sends the confirmation', async () => {
    const auth = { signup: jest.fn().mockResolvedValue({ access_token: 't' }) };
    const mail = { sendRegistrationConfirmation: jest.fn() };
    const controller = new AuthController(auth as any, mail as any);
    await expect(
      controller.signup({
        email: 'a@x.test',
        password: 'pw',
        firstName: 'Ana',
        lastName: 'Cruz',
      }),
    ).resolves.toEqual({ access_token: 't' });
    expect(mail.sendRegistrationConfirmation).toHaveBeenCalledWith(
      'a@x.test',
      'Ana',
    );
  });

  it('sends nothing when the account is not created', async () => {
    const auth = { signup: jest.fn().mockRejectedValue(new Error('dup')) };
    const mail = { sendRegistrationConfirmation: jest.fn() };
    const controller = new AuthController(auth as any, mail as any);
    await expect(
      controller.signup({
        email: 'a@x.test',
        password: 'pw',
        firstName: 'Ana',
        lastName: 'Cruz',
      }),
    ).rejects.toThrow('dup');
    expect(mail.sendRegistrationConfirmation).not.toHaveBeenCalled();
  });
});
