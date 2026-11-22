import { describe, it, expect, vi } from 'vitest';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import api from './api';

const reply = (config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse =>
  ({ config, status, statusText: '', headers: {}, data });

describe('api client', () => {
  it('retries a request once when the CSRF token raced, sending the current cookie value', async () => {
    document.cookie = 'csrf_token=old';
    const seen: string[] = [];
    const adapter = vi.fn<AxiosAdapter>(async (config) => {
      seen.push(String(config.headers['X-CSRF-Token']));
      if (seen.length === 1) {
        document.cookie = 'csrf_token=new'; // a parallel response replaced the cookie meanwhile
        return Promise.reject(Object.assign(new Error('403'), {
          config, response: reply(config, 403, { error: { code: 'CSRF_INVALID' } }),
        }));
      }
      return reply(config, 200, { ok: true });
    });
    const res = await api.post('/notifications/read-all', {}, { adapter });
    expect(res.data).toEqual({ ok: true });
    expect(seen).toEqual(['old', 'new']);
  });

  it('does not retry other 403s', async () => {
    const adapter = vi.fn<AxiosAdapter>(async (config) => Promise.reject(Object.assign(new Error('403'), {
      config, response: reply(config, 403, { error: { code: 'FORBIDDEN' } }),
    })));
    await expect(api.post('/admin/users', {}, { adapter })).rejects.toThrow('403');
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
