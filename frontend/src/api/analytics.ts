import { api } from '../lib/api';
import type {
  AnalyticsSummary,
  StatusDistribution,
  TimeseriesInterval,
  TimeseriesResponse,
  TopEndpointsResponse,
} from '../lib/types';

interface AnalyticsQuery {
  days: number;
  project?: string;
}

export async function fetchSummary(query: AnalyticsQuery): Promise<AnalyticsSummary> {
  const { data } = await api.get<AnalyticsSummary>('/api/analytics/summary/', {
    params: { days: query.days, ...(query.project ? { project: query.project } : {}) },
  });
  return data;
}

export async function fetchTimeseries(
  query: AnalyticsQuery & { interval: TimeseriesInterval },
): Promise<TimeseriesResponse> {
  const { data } = await api.get<TimeseriesResponse>(
    '/api/analytics/timeseries/',
    {
      params: {
        days: query.days,
        interval: query.interval,
        ...(query.project ? { project: query.project } : {}),
      },
    },
  );
  return data;
}

export async function fetchStatusDistribution(
  query: AnalyticsQuery,
): Promise<StatusDistribution> {
  const { data } = await api.get<StatusDistribution>(
    '/api/analytics/status-distribution/',
    { params: { days: query.days, ...(query.project ? { project: query.project } : {}) } },
  );
  return data;
}

export async function fetchTopEndpoints(
  query: AnalyticsQuery,
): Promise<TopEndpointsResponse> {
  const { data } = await api.get<TopEndpointsResponse>(
    '/api/analytics/top-endpoints/',
    { params: { days: query.days, ...(query.project ? { project: query.project } : {}) } },
  );
  return data;
}
