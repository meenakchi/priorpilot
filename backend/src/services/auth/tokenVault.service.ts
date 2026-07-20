import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { TokenVaultToken } from '../../utils/types';

/**
 * Auth0 Token Vault Service
 *
 * Token Vault stores third-party OAuth tokens (like Epic FHIR tokens) on behalf
 * of your users. Your agent never sees raw credentials — it makes a signed request
 * to Token Vault with the user's Auth0 access token, and Token Vault returns a
 * fresh third-party token scoped to that connection.
 *
 * Docs: https://auth0.com/docs/secure/tokens/token-vault
 */
export class TokenVaultService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = env.auth0TokenVaultUrl;
  }

  /**
   * Retrieve a stored token for a given user + connection from Token Vault.
   * @param auth0AccessToken - The user's Auth0 access token (proves identity)
   * @param connection - The Token Vault connection name (e.g. "epic-fhir")
   */
  async getToken(auth0AccessToken: string, connection: string): Promise<TokenVaultToken> {
    try {
      logger.info(`[TokenVault] Requesting token for connection: ${connection}`);

      const response = await axios.get<TokenVaultToken>(
        `${this.baseUrl}/connections/${connection}/token`,
        {
          headers: {
            Authorization: `Bearer ${auth0AccessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`[TokenVault] Token retrieved successfully for connection: ${connection}`);
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { status: number; data: unknown }; message: string };
      logger.error('[TokenVault] Failed to retrieve token', {
        connection,
        status: err.response?.status,
        data: err.response?.data,
      });

      if (err.response?.status === 401) {
        throw new Error('Token Vault: User has not linked their Epic FHIR account. CIBA consent required.');
      }
      if (err.response?.status === 404) {
        throw new Error(`Token Vault: Connection "${connection}" not found. Check your Auth0 Token Vault configuration.`);
      }
      throw new Error(`Token Vault error: ${err.message}`);
    }
  }

  /**
   * Initiate the OAuth linking flow for a user to connect their EHR.
   * Returns the authorization URL to redirect the user to.
   */
  async initiateLink(auth0AccessToken: string, connection: string): Promise<{ authorizationUrl: string }> {
    try {
      const response = await axios.post<{ authorization_url: string }>(
        `${this.baseUrl}/connections/${connection}/link`,
        {},
        {
          headers: {
            Authorization: `Bearer ${auth0AccessToken}`,
          },
        }
      );

      return { authorizationUrl: response.data.authorization_url };
    } catch (error: unknown) {
      const err = error as { message: string };
      throw new Error(`Failed to initiate Token Vault link: ${err.message}`);
    }
  }
}

export const tokenVaultService = new TokenVaultService();