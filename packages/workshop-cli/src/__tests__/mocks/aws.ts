import { vi } from 'vitest';

export const mockLambdaClient = {
  send: vi.fn(),
};

export const mockSQSClient = {
  send: vi.fn(),
};

export const mockCloudWatchLogsClient = {
  send: vi.fn(),
};

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn(() => mockLambdaClient),
  InvokeCommand: vi.fn(),
  GetFunctionCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn(() => mockSQSClient),
  SendMessageCommand: vi.fn(),
  ReceiveMessageCommand: vi.fn(),
  GetQueueAttributesCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  CloudWatchLogsClient: vi.fn(() => mockCloudWatchLogsClient),
  GetLogEventsCommand: vi.fn(),
  FilterLogEventsCommand: vi.fn(),
}));
