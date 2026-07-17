import { describe, expect, it } from 'vitest';
import { accountLinkStateForUser } from './authService';

describe('estado do vínculo da conta', () => {
  it('mantém o convidado pendente até confirmar e definir a senha', () => {
    expect(accountLinkStateForUser({ is_anonymous: true, user_metadata: {} })).toBe('anonymous');
    expect(accountLinkStateForUser({
      is_anonymous: true,
      user_metadata: { rbt_account_setup: 'pending-password' }
    })).toBe('pending-email');
    expect(accountLinkStateForUser({
      is_anonymous: false,
      user_metadata: { rbt_account_setup: 'pending-password' }
    })).toBe('pending-email');
    expect(accountLinkStateForUser({
      is_anonymous: false,
      user_metadata: { rbt_account_setup: 'complete' }
    })).toBe('permanent');
  });
});
