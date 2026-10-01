import { api } from '../lib/api';
import type {
  AuthResponse,
  ProfileUpdate,
  RegisterPayload,
  User,
} from '../lib/types';

export async function loginRequest(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/auth/token/', {
    email,
    password,
  });
  return data;
}

export async function registerRequest(
  payload: RegisterPayload,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/auth/register/', payload);
  return data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>('/api/auth/me/');
  return data;
}

export async function updateMe(payload: ProfileUpdate): Promise<User> {
  const { data } = await api.patch<User>('/api/auth/me/', payload);
  return data;
}
