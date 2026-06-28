import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

/**
 * Thin adapter over Amazon Cognito. Used when AUTH_DRIVER=cognito so Cognito is
 * the system of record for credentials, social IdPs, passkeys and MFA, while the
 * application still issues its own session tokens (see TokensService).
 *
 * When AUTH_DRIVER=local this adapter is not exercised, enabling a fully offline
 * dev/test loop without AWS.
 */
@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private readonly client: CognitoIdentityProviderClient;

  constructor(private readonly config: ConfigService) {
    this.client = new CognitoIdentityProviderClient({
      region: this.config.get<string>('region'),
    });
  }

  private secretHash(username: string): string | undefined {
    const clientSecret = this.config.get<string>('cognito.clientSecret');
    const clientId = this.config.get<string>('cognito.clientId');
    if (!clientSecret) return undefined;
    return createHmac('sha256', clientSecret)
      .update(username + clientId)
      .digest('base64');
  }

  async signUp(email: string, password: string, displayName: string): Promise<string> {
    const res = await this.client.send(
      new SignUpCommand({
        ClientId: this.config.get<string>('cognito.clientId'),
        Username: email,
        Password: password,
        SecretHash: this.secretHash(email),
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'name', Value: displayName },
        ],
      }),
    );
    return res.UserSub!;
  }

  async confirmSignUp(email: string, code: string): Promise<void> {
    await this.client.send(
      new ConfirmSignUpCommand({
        ClientId: this.config.get<string>('cognito.clientId'),
        Username: email,
        ConfirmationCode: code,
        SecretHash: this.secretHash(email),
      }),
    );
  }

  async authenticate(email: string, password: string): Promise<void> {
    await this.client.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.config.get<string>('cognito.clientId'),
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
          ...(this.secretHash(email) ? { SECRET_HASH: this.secretHash(email)! } : {}),
        },
      }),
    );
  }

  async forgotPassword(email: string): Promise<void> {
    await this.client.send(
      new ForgotPasswordCommand({
        ClientId: this.config.get<string>('cognito.clientId'),
        Username: email,
        SecretHash: this.secretHash(email),
      }),
    );
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.client.send(
      new ConfirmForgotPasswordCommand({
        ClientId: this.config.get<string>('cognito.clientId'),
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
        SecretHash: this.secretHash(email),
      }),
    );
  }
}
